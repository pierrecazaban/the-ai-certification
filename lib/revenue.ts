import 'server-only';
import { cache } from 'react';
import { sql } from './db';
import { setting } from './settings';
import { StripeError, stripeBalance } from './stripe';

// The admin counts all revenue in euros (19/11). A sale in another currency counts for what Stripe really
// credited in euros, saved once on the registration (eur_cents). When Stripe keeps that currency as it is (the
// account has a dollar balance), it is converted at the ECB rate of the day of the sale, saved once too; until
// then, at the ECB rate of today.

/** ECB rates (1 € = x) of a day (YYYY-MM-DD) or the latest, refreshed twice a day; empty when they cannot be read. */
async function ecbRates(day = 'latest'): Promise<Record<string, number>> {
  try {
    const res = await fetch(`https://api.frankfurter.dev/v1/${day}?base=EUR`, { next: { revalidate: 43200 }, signal: AbortSignal.timeout(3000) });
    if (!res.ok) return {};
    return ((await res.json()) as { rates?: Record<string, number> }).rates ?? {};
  } catch {
    return {};
  }
}

/** SQL for a registration's amount in euro cents. Saves the Stripe conversions still missing first. */
export const eurCentsSql = cache(async (): Promise<string> => {
  const missing = await sql(
    `select id, payment_id, currency, amount_cents, coalesce(paid_at, created_at) as paid_at from registrations
      where status = 'paid' and currency <> 'EUR' and eur_cents is null and amount_cents > 0
        and payment_id like 'cs\\_%' and payment_id not like 'cs\\_test\\_%'`,
  );
  let unknown = false;
  for (const r of missing) {
    try {
      const bt = await stripeBalance(String(r.payment_id));
      let cents = bt?.currency === 'eur' ? bt.amount : null;
      if (bt && cents === null) {
        // Stripe kept the sale's own currency: ECB rate of the day of the sale.
        const rate = (await ecbRates(new Date(r.paid_at).toISOString().slice(0, 10)))[String(r.currency)];
        if (rate > 0) cents = Math.round(Number(r.amount_cents) / rate);
      }
      if (cents === null) unknown = true;
      else await sql('update registrations set eur_cents = $2 where id = $1', [r.id, cents]);
    } catch (err) {
      unknown = true;
      console.error('revenue: Stripe conversion', err);
    }
  }
  const rates = unknown ? await ecbRates() : {};
  const est = Object.entries(rates)
    .filter(([c, x]) => /^[A-Z]{3}$/.test(c) && Number.isFinite(x) && x > 0)
    .map(([c, x]) => `when '${c}' then round(amount_cents / ${x})::int`)
    .join(' ');
  return `(case when currency = 'EUR' then amount_cents else coalesce(eur_cents${est ? `, case currency ${est} end` : ''}, 0) end)`;
});

// Frais Stripe (26/11) : lus UNE fois par vente et gardés sur l'inscription (stripe_fee_cents, en centimes d'euro).
// Avant, l'admin rebalayait toutes les ventes du compte Stripe à chaque ouverture, deux fois (tuile et graphique) :
// 13 s par balayage à 391 ventes, et de plus en plus long. Désormais une ouverture ne lit chez Stripe que les ventes
// arrivées depuis la précédente (0,24 s chacune, en parallèle), et aucune quand il n'y en a pas.
// Contrôle du 26/11 sur le compte réel : 372 ventes, 275,26 € de frais par les deux méthodes, 0 centime d'écart.

/** Ventes dont il faut lire les frais : vraies sessions Checkout payées (ou remboursées depuis : Stripe garde ses
 *  frais), ni tests ni invités. Une lecture sans résultat (frais pas encore posés, session introuvable) est retentée
 *  toutes les 10 minutes pendant 3 jours, puis la vente garde l'estimation. */
const FEE_TO_READ = `stripe_fee_cents is null and status in ('paid', 'refunded') and amount_cents > 0
  and payment_id like 'cs\\_live\\_%'
  and (stripe_fee_checked_at is null
       or (stripe_fee_checked_at < now() - interval '10 minutes' and coalesce(paid_at, created_at) > now() - interval '3 days'))`;
const FEE_WAVE = 10; // lectures en parallèle (Stripe accepte 100 lectures par seconde)
const FEE_BUDGET_MS = 8000; // au-delà, la suite attend l'ouverture suivante : la page ne reste jamais bloquée

/** Lit chez Stripe les frais des ventes qui ne les ont pas encore, une seule fois par vente (une par requête). */
export const readNewStripeFees = cache(async (): Promise<void> => {
  const todo = await sql(
    `select id::text as id, payment_id, coalesce(paid_at, created_at) as paid_at from registrations
      where ${FEE_TO_READ} order by coalesce(paid_at, created_at) limit 2000`,
  );
  if (!todo.length || !(await setting('STRIPE_SECRET_KEY'))) return;
  const stop = Date.now() + FEE_BUDGET_MS;
  for (let i = 0; i < todo.length && Date.now() < stop; i += FEE_WAVE) {
    const wave = await Promise.all(
      todo.slice(i, i + FEE_WAVE).map(async (r) => {
        try {
          const bt = await stripeBalance(String(r.payment_id));
          if (!bt) return { id: String(r.id), fee: null as number | null }; // pas encore de frais posés : retenté plus tard
          if (bt.currency === 'eur') return { id: String(r.id), fee: bt.fee };
          // Frais pris dans une autre monnaie (solde en dollars) : taux BCE du jour de la vente, comme eur_cents.
          const rate = (await ecbRates(new Date(r.paid_at).toISOString().slice(0, 10)))[bt.currency.toUpperCase()];
          return rate > 0 ? { id: String(r.id), fee: Math.round(bt.fee / rate) } : undefined; // taux illisible : retenté
        } catch (err) {
          // Session inconnue de cette clé : retentée seulement dans 10 min. Autre erreur (Stripe injoignable) : intacte.
          if (err instanceof StripeError && err.status === 404) return { id: String(r.id), fee: null as number | null };
          console.error('revenue: Stripe fee', err);
          return undefined;
        }
      }),
    );
    const read = wave.filter((w): w is { id: string; fee: number } => typeof w?.fee === 'number');
    const missing = wave.filter((w) => w && w.fee === null).map((w) => w!.id);
    if (read.length) {
      await sql(
        `update registrations r set stripe_fee_cents = v.fee, stripe_fee_checked_at = now()
           from unnest($1::text[], $2::int[]) as v(id, fee) where r.id = v.id::uuid and r.stripe_fee_cents is null`,
        [read.map((w) => w.id), read.map((w) => w.fee)],
      );
    }
    if (missing.length) {
      await sql(`update registrations set stripe_fee_checked_at = now() where id = any($1::uuid[]) and stripe_fee_cents is null`, [missing]);
    }
    // Toute une vague en échec (clé refusée, Stripe en panne) : inutile d'insister à cette ouverture.
    if (wave.every((w) => w === undefined)) break;
  }
});

/** Stripe's standard price for European cards, used only when the real fees cannot be read. */
export const estimatedFee = (cents: number, n: number) => Math.round(cents * 0.015) + 25 * n;

/** SQL des frais Stripe d'une inscription en centimes d'euro : les réels une fois lus ; sinon, pour une vente Stripe, le
 *  tarif européen standard (signalé « est. ») ; rien pour ce qui n'est pas passé par Stripe. */
export async function feeCentsSql(): Promise<string> {
  const eur = await eurCentsSql();
  return `(case when stripe_fee_cents is not null then stripe_fee_cents
     when amount_cents > 0 and payment_id like 'cs\\_live\\_%' then (round((${eur}) * 0.015) + 25)::int else 0 end)`;
}
/** SQL : vrai quand les frais de cette inscription sont estimés (pas encore lus chez Stripe). */
export const FEE_ESTIMATED = `(stripe_fee_cents is null and amount_cents > 0 and payment_id like 'cs\\_live\\_%')`;
