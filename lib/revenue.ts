import 'server-only';
import { cache } from 'react';
import { sql } from './db';
import { setting } from './settings';
import { STRIPE_APP, stripeBalance } from './stripe';

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

/** Real Stripe fees of this site's payments since `since` (the account is shared: other sites are left out).
 *  Per Paris day: { fee, net } in cents. null when Stripe cannot be read (no key, key without the right). */
export const stripeFees = cache(async (since: number): Promise<Map<string, { fee: number; net: number }> | null> => {
  const key = await setting('STRIPE_SECRET_KEY');
  if (!key) return null;
  const out = new Map<string, { fee: number; net: number }>();
  let rates: Record<string, number> | null = null; // read only when a fee is not in euros (dollar balance)
  let after = '';
  try {
    for (let page = 0; page < 30; page++) {
      const url = `https://api.stripe.com/v1/charges?limit=100&created[gte]=${since}&expand[]=data.balance_transaction&expand[]=data.payment_intent${after ? `&starting_after=${after}` : ''}`;
      const res = await fetch(url, { headers: { authorization: `Bearer ${key}` }, next: { revalidate: 600 } });
      if (!res.ok) return null;
      const d = (await res.json()) as { data: StripeCharge[]; has_more: boolean };
      for (const c of d.data) {
        const app = c.metadata?.app || (typeof c.payment_intent === 'object' ? c.payment_intent?.metadata?.app : undefined);
        const bt = typeof c.balance_transaction === 'object' ? c.balance_transaction : null;
        if (app !== STRIPE_APP || c.status !== 'succeeded' || !bt) continue;
        const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date(c.created * 1000));
        // A fee taken in dollars (19/11) is converted, not added as if it were euros.
        let rate = 1;
        if (bt.currency && bt.currency !== 'eur') rate = (rates ??= await ecbRates())[bt.currency.toUpperCase()] || 1;
        const cur = out.get(day) ?? { fee: 0, net: 0 };
        out.set(day, { fee: cur.fee + Math.round(bt.fee / rate), net: cur.net + Math.round(bt.net / rate) });
      }
      if (!d.has_more || !d.data.length) break;
      after = d.data[d.data.length - 1].id;
    }
    return out;
  } catch {
    return null;
  }
});
type StripeCharge = {
  id: string; created: number; status: string; metadata?: Record<string, string>;
  payment_intent?: string | { metadata?: Record<string, string> } | null;
  balance_transaction?: string | { fee: number; net: number; currency?: string } | null;
};
/** Stripe's standard price for European cards, used only when the real fees cannot be read. */
export const estimatedFee = (cents: number, n: number) => Math.round(cents * 0.015) + 25 * n;

/** Stripe fees of all this site's sales since `since` (epoch seconds), in euro cents; null when Stripe cannot be read. */
export async function feesSince(since: number): Promise<number | null> {
  const days = await stripeFees(since);
  return days ? [...days.values()].reduce((s, x) => s + x.fee, 0) : null;
}
