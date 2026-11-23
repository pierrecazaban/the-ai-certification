import 'server-only';
import { sql } from './db';
import { isLocale } from './locales';
import { sendFinishNudgeEmail } from './email';
import { stripePaidAndKept } from './stripe';
import { blockedNow, blockedPeople, quotaHit, relanceAllowance, relanceOpen } from './relanceGuard';

// Relance formation (23/11) : « Finissez votre formation en une soirée pour être certifié sur LinkedIn ». Elle sert à
// faire finir la formation (les avis se donnent à la fin). Un mail, une seule fois par personne. En plus des garde-fous
// communs (lib/relanceGuard.ts), la personne doit :
//   - avoir un vrai paiement Stripe (pas un accès offert, pas un test), revérifié chez Stripe au moment de l'envoi :
//     encaissé, ni remboursé ni contesté ;
//   - ne pas avoir son certificat ;
//   - avoir payé depuis plus de 2 h et ne pas avoir validé de leçon dans les 3 dernières heures (elle est dessus).

export type NudgeTarget = { id: string; email: string; first_name: string; locale: string; reference: string; payment_id: string };
export type NudgeExcluded = { email: string; name: string; why: string };

export async function finishNudgeList(only?: string) {
  const paid = await sql(
    `select distinct on (lower(r.email)) r.id::text as id, lower(r.email) as email, r.first_name, r.last_name, r.locale, r.reference, r.payment_id,
            coalesce(r.paid_at, r.created_at) > now() - interval '2 hours' as fresh,
            exists (select 1 from lesson_progress lp join users u on u.id = lp.user_id
                     where (lp.user_id = r.user_id or lower(u.email) = lower(r.email)) and lp.completed_at > now() - interval '3 hours') as studying
       from registrations r
      where r.status = 'paid' and r.amount_cents > 0 and r.payment_id like 'cs\\_live\\_%'
        and ($1 = '' or lower(r.email) = $1)
        and not exists (
          select 1 from certificates c join users u on u.id = c.user_id
           where c.program = r.program and (c.user_id = r.user_id or lower(u.email) = lower(r.email)))
      order by lower(r.email), coalesce(r.paid_at, r.created_at) desc`,
    [(only ?? '').toLowerCase()],
  );
  // Never twice (23/11). Any line in finish_nudges closes the address for good, even a send that was cut off half-way:
  // the mail may have left, so it is never replayed by itself. Same person under another address (same first and last
  // name): one mail only.
  const done = await sql(
    `select f.email, f.status, lower(trim(r.first_name)) as fn, lower(trim(r.last_name)) as ln
       from finish_nudges f left join registrations r on r.id = f.registration_id`,
  );
  const doneSet = new Set(done.filter((d) => d.status !== 'bloque').map((d) => String(d.email)));
  const names = new Set(done.filter((d) => d.fn && d.ln).map((d) => `${d.fn}|${d.ln}`));
  // Stripe said no (not paid, refunded or disputed) when it was about to leave: never written to.
  const stripeNo = new Set(done.filter((d) => d.status === 'bloque').map((d) => String(d.email)));
  const blocked = await blockedPeople();

  const targets: NudgeTarget[] = [];
  const excluded: NudgeExcluded[] = [];
  let already = 0;
  let later = 0;
  for (const r of paid) {
    const email = String(r.email);
    const name = `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim();
    const person = `${String(r.first_name ?? '').trim().toLowerCase()}|${String(r.last_name ?? '').trim().toLowerCase()}`;
    const why = blocked.why(email, String(r.reference)) ?? (stripeNo.has(email) ? 'Stripe : paiement non encaissé, remboursé ou contesté' : null);
    if (why) excluded.push({ email, name, why });
    else if (doneSet.has(email)) already++;
    else if (person !== '|' && names.has(person)) excluded.push({ email, name, why: 'même nom déjà relancé sous une autre adresse' });
    else if (r.fresh || r.studying) later++;
    else if (names.add(person)) targets.push({ id: String(r.id), email, first_name: String(r.first_name ?? '').trim(), locale: String(r.locale ?? 'en-us'), reference: String(r.reference), payment_id: String(r.payment_id ?? '') });
  }
  return { targets, excluded, already, later };
}

/**
 * Sends the reminder to everyone on the list (or to `only`), until `budgetMs` is spent or `max` mails have left.
 * Each address is claimed in finish_nudges before its mail leaves (never twice), and every condition is read again
 * for that person right before: tickets, refund, certificate, and the payment at Stripe.
 */
export async function sendFinishNudges(budgetMs: number, opts: { max?: number; only?: string } = {}) {
  const open = await relanceOpen();
  if (!open.ok) return { sent: 0, failed: 0, blocked: 0, left: -1, why: open.why };
  const start = Date.now();
  const { targets } = await finishNudgeList(opts.only);
  // Never more than what the day's quota leaves once the essential mails have their room.
  const max = Math.min(opts.max ?? Infinity, await relanceAllowance());
  let why = '';
  let sent = 0;
  let failed = 0;
  let blocked = 0;
  let i = 0;
  for (; i < targets.length && Date.now() - start < budgetMs && sent < max; i++) {
    const t = targets[i];
    // The address is taken before anything else: two sends at the same time cannot both get it.
    const claimed = await sql(
      `insert into finish_nudges (email, registration_id) values ($1, $2) on conflict (email) do nothing returning email`,
      [t.email, t.id],
    );
    if (!claimed.length) continue;
    // Released only when it is certain that no mail left (a check said no before the send, or the provider refused it).
    const release = () => sql(`delete from finish_nudges where email = $1 and status <> 'sent'`, [t.email]);

    // Everything again, for this person, now.
    const [still] = await sql(
      `select 1 from registrations r where r.id = $1 and r.status = 'paid' and r.payment_id = $2 and r.amount_cents > 0
          and not exists (select 1 from certificates c join users u on u.id = c.user_id
                           where c.program = r.program and (c.user_id = r.user_id or lower(u.email) = lower(r.email)))`,
      [t.id, t.payment_id],
    );
    if (!still || (await blockedNow(t.email, t.reference))) {
      await release();
      continue;
    }
    // Stripe confirms the money was received and kept. Stripe unreachable: nothing leaves, the address waits.
    const kept = await stripePaidAndKept(t.payment_id).catch(() => null);
    if (kept === false) {
      blocked++;
      await sql(`update finish_nudges set status = 'bloque', sent_at = now() where email = $1`, [t.email]);
      continue;
    }
    if (kept === null) {
      failed++;
      await release();
      continue;
    }
    const status = await sendFinishNudgeEmail({ to: t.email, firstName: t.first_name, locale: isLocale(t.locale) ? t.locale : 'en-us', registrationId: t.id }).catch(() => 'failed');
    if (status === 'sent' || status === 'duplicate') {
      if (status === 'sent') sent++;
      await sql(`update finish_nudges set status = 'sent', sent_at = now() where email = $1`, [t.email]);
    } else {
      // Not delivered: the failed mail is on record, so this address is no longer offered.
      failed++;
      await release();
      // Refused for quota: every other mail would be refused too, and each try eats into nothing but trouble. Stop.
      if (await quotaHit(t.email)) {
        why = 'quota d’envoi du fournisseur d’e-mails atteint';
        i++;
        break;
      }
    }
    await new Promise((r) => setTimeout(r, 550)); // Resend accepts 2 requests per second
  }
  return { sent, failed, blocked, left: targets.length - i, why };
}
