import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { sql } from './db';
import { isLocale } from './locales';
import { unfinishedRegistrations } from './relances';
import { sendPayReminderEmail, sendRelanceAlert } from './email';
import { syncPayment } from './school';
import { blockedNow, blockedPeople, quotaHit, relanceAllowance, relanceOpen } from './relanceGuard';

// Rappel de paiement automatique (23/11), par e-mail Kai (Resend). Il remplace les relances Smart Mail (mesuré ce jour-là :
// 40 sur 67 jamais parties, 1 personne relancée sur 26 avait payé ensuite) et les boutons de l'admin.
//
// UN SEUL rappel par personne, à vie. Il part tout seul 1 heure après la dernière tentative d'inscription restée sans
// paiement (92 % des acheteurs paient dans le quart d'heure : après, il faut les rattraper tant que l'envie est là),
// entre 9 h et 22 h à Paris. Deux horloges le déclenchent toutes les 10 minutes (les serveurs OVH et Paris appellent
// /api/relances/campagne) : elles ne peuvent pas écrire deux fois, chaque adresse est prise dans kai_reminders avant l'envoi.
//
// En plus des garde-fous communs (lib/relanceGuard.ts) : jamais à quelqu'un qui a payé (chaque tentative est relue chez
// Stripe juste avant l'envoi), ni à un homonyme d'un payeur ou d'une personne déjà rappelée (même personne, autre adresse),
// ni à quelqu'un que Smart Mail avait déjà relancé.
//
// Mesure : jusqu'au 7/12, une personne sur cinq (tirée par son adresse) passe tous les contrôles mais ne reçoit rien.
// Comparer ceux qui paient dans les deux groupes dit si le rappel rapporte vraiment.

const H = 3600_000;
const STEP = 1;
const DELAY = 1 * H;
/** End of the measure: after this day everybody due gets the reminder. */
const CONTROL_UNTIL = process.env.PAY_REMINDERS_CONTROL_UNTIL ?? '2026-12-07T23:00:00Z';
const CONTROL_ONE_IN = 5;
/** Start of the automatic reminders: the figures compare the reminded and the control group from here on (the reminders
 *  of the afternoon of 23/11 were sent by hand, days after the registration for most, and have no control group). */
const MEASURE_SINCE = '2026-11-23T15:00:00Z';

/** Stable draw from the address itself: the same person is always in the same group. */
export function inControlGroup(email: string) {
  if (Date.now() >= new Date(CONTROL_UNTIL).getTime()) return false;
  return createHash('sha256').update(`rappel-paiement:${email.toLowerCase()}`).digest().readUInt32BE(0) % CONTROL_ONE_IN === 0;
}

export type PayTarget = { id: string; email: string; first_name: string; locale: string; link: string; deadline: string; reference: string; control: boolean };
export type PayExcluded = { email: string; why: string };

/** Who is due the reminder now: latest attempt at least an hour old, still unpaid, never reminded, every guard passed. */
export async function payReminderList() {
  const now = Date.now();
  const list = await unfinishedRegistrations();
  const targets: PayTarget[] = [];
  const excluded: PayExcluded[] = [];
  let waiting = 0;
  let already = 0;
  if (!list.length) return { targets, excluded, waiting, already };

  const extra = await sql(
    `select id::text as id, upper(reference) as reference, lower(trim(first_name)) as fn, lower(trim(last_name)) as ln from registrations where id::text = any($1)`,
    [list.map((r) => r.id)],
  );
  // Never twice. Done for good: any line in kai_reminders (a reminder sent, a send cut off half-way since the mail may
  // have left, or the control group), and any Smart Mail reminder that really left. By address, and by first and last
  // name (same person, other address).
  const kai = await sql(
    `select k.email, lower(trim(r.first_name)) as fn, lower(trim(r.last_name)) as ln from kai_reminders k left join registrations r on r.id::text = k.registration_id`,
  );
  const sm = await sql(
    `select distinct lower(r.email) as email, lower(trim(r.first_name)) as fn, lower(trim(r.last_name)) as ln
       from reminders m join registrations r on r.id::text = m.registration_id where m.ok and m.step > 0`,
  );
  const doneEmails = new Set([...kai, ...sm].map((d) => String(d.email)));
  const doneNames = new Set([...kai, ...sm].filter((d) => d.fn && d.ln).map((d) => `${d.fn}|${d.ln}`));
  // Same first and last name already paid under another address: very likely the same person.
  const paidNames = new Set(
    (await sql(`select distinct lower(trim(first_name)) as fn, lower(trim(last_name)) as ln from registrations where status in ('paid', 'refunded')`)).map((p) => `${p.fn}|${p.ln}`),
  );
  const blocked = await blockedPeople();

  for (const r of list) {
    const x = extra.find((e) => e.id === r.id);
    if (!x || new Date(r.deadline).getTime() <= now) continue;
    if (doneEmails.has(r.email)) {
      already++;
      continue;
    }
    if (now - new Date(r.created_at).getTime() < DELAY) {
      waiting++;
      continue;
    }
    const person = x.fn && x.ln ? `${x.fn}|${x.ln}` : '';
    const why = blocked.why(r.email, String(x.reference))
      ?? (person && paidNames.has(person) ? 'même nom déjà payé sous une autre adresse' : null)
      ?? (person && doneNames.has(person) ? 'même nom déjà rappelé sous une autre adresse' : null);
    if (why) {
      excluded.push({ email: r.email, why });
      continue;
    }
    if (person) doneNames.add(person);
    targets.push({ id: r.id, email: r.email, first_name: r.first_name, locale: r.locale, link: r.link, deadline: r.deadline, reference: String(x.reference), control: inControlGroup(r.email) });
  }
  return { targets, excluded, waiting, already };
}

/**
 * Sends the reminders due, until `budgetMs` is spent or `max` mails have left. One by one, right before each mail:
 * the address is taken in kai_reminders (never twice, and never given back unless it is certain no mail left), every
 * payment attempt of the person is read again from Stripe (a payment the site missed is recorded, and the mail does not
 * leave), and tickets, refunds and « stop » are read again. Someone of the control group goes through the same checks
 * and then gets no mail.
 */
export async function sendPayReminders(budgetMs: number, opts: { max?: number } = {}) {
  const open = await relanceOpen();
  if (!open.ok) return { sent: 0, failed: 0, skipped: 0, control: 0, left: -1, why: open.why };
  const start = Date.now();
  const { targets } = await payReminderList();
  // Never more than what the day's quota leaves once the essential mails have their room.
  const max = Math.min(opts.max ?? Infinity, await relanceAllowance());
  let why = '';
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let control = 0;
  let i = 0;
  for (; i < targets.length && Date.now() - start < budgetMs && sent < max; i++) {
    const t = targets[i];
    const claimed = await sql(
      `insert into kai_reminders (email, step, registration_id) values ($1, $2, $3) on conflict (email, step) do nothing returning email`,
      [t.email, STEP, t.id],
    );
    if (!claimed.length) continue;
    const release = () => sql(`delete from kai_reminders where email = $1 and step = $2 and not ok and not control`, [t.email, STEP]);

    // Paid in the meantime? Each attempt of this person that went to the payment page is read again from Stripe.
    let verified = true;
    const attempts = await sql(
      `select payment_id from registrations where lower(email) = $1 and payment_id like 'cs\\_%' and status not in ('paid', 'refunded') and created_at > now() - interval '11 days'`,
      [t.email],
    );
    for (const a of attempts) {
      try {
        await syncPayment(String(a.payment_id));
      } catch {
        verified = false; // Stripe does not answer: nothing leaves, the reminder waits for the next round
      }
    }
    const [paid] = await sql(`select 1 from registrations where lower(email) = $1 and status in ('paid', 'refunded') limit 1`, [t.email]);
    // Tickets, refund, « stop » and failed mails read again for this person, right now.
    if (!verified || paid || (await blockedNow(t.email, t.reference))) {
      skipped++;
      await release();
      continue;
    }
    if (t.control) {
      control++;
      await sql(`update kai_reminders set control = true, sent_at = now() where email = $1 and step = $2`, [t.email, STEP]);
      continue;
    }

    const status = await sendPayReminderEmail({
      to: t.email, firstName: t.first_name, locale: isLocale(t.locale) ? t.locale : 'en-us', step: STEP, link: t.link, deadline: t.deadline, registrationId: t.id,
    }).catch(() => 'failed');
    if (status === 'sent' || status === 'duplicate') {
      if (status === 'sent') sent++;
      await sql(`update kai_reminders set ok = true, sent_at = now() where email = $1 and step = $2`, [t.email, STEP]);
    } else {
      // The provider refused it: no mail left. The failed mail is on record, so this address is no longer offered.
      failed++;
      await release();
      // Refused for quota: every other mail would be refused too. Stop.
      if (await quotaHit(t.email)) {
        why = 'quota d’envoi du fournisseur d’e-mails atteint';
        i++;
        break;
      }
    }
    await new Promise((r) => setTimeout(r, 550)); // Resend accepts 2 requests per second
  }
  return { sent, failed, skipped, control, left: targets.length - i, why };
}

const LATE = 2 * H;
const paris = (d: Date) => d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });

/** One alert of a kind per 6 hours at most, by mail to the admin. */
async function alert(kind: string, subject: string, lines: string[]) {
  const [recent] = await sql(`select 1 from relance_runs where source = $1 and at > now() - interval '6 hours' limit 1`, [`alerte:${kind}`]);
  if (recent) return;
  await sql(`insert into relance_runs (id, source, why) values ($1, $2, $3)`, [randomUUID(), `alerte:${kind}`, subject]);
  await sendRelanceAlert({ subject, lines }).catch(() => {});
}

/** When each clock last called, and whether the reminders have stopped turning (no call for 2 hours). */
export async function relanceClock() {
  const rows = await sql(`select source, at from relance_heartbeat order by at desc`);
  const last = rows[0] ? new Date(rows[0].at) : null;
  return { last, late: !last || Date.now() - last.getTime() > LATE, sources: rows.map((r) => ({ source: String(r.source), at: new Date(r.at) })) };
}

/** Called by a third clock (Smart Mail's own evening poll): warns the admin when the two clocks are silent. */
export async function watchRelanceClock() {
  const clock = await relanceClock();
  if (clock.last && clock.late) {
    await alert('arret', 'Rappels de paiement : la tâche automatique ne tourne plus', [
      `Aucun passage depuis le ${paris(clock.last)}.`,
      'Les rappels de paiement ne partent plus. Vérifier la tâche planifiée (cron) sur les serveurs OVH et Paris.',
    ]);
  }
  return clock;
}

/** One automatic round, called every 10 minutes by each clock: sends what is due, notes the round, warns on trouble. */
export async function runPayReminders(source: string, opts: { max?: number } = {}) {
  const before = await relanceClock();
  await sql(`insert into relance_heartbeat (source, at) values ($1, now()) on conflict (source) do update set at = now()`, [source.slice(0, 40)]);
  const r = await sendPayReminders(40_000, opts);
  if (r.sent || r.failed || r.skipped || r.control || /quota/.test(r.why)) {
    await sql(`insert into relance_runs (id, source, sent, failed, skipped, control, why) values ($1, $2, $3, $4, $5, $6, $7)`, [
      randomUUID(), source.slice(0, 40), r.sent, r.failed, r.skipped, r.control, r.why,
    ]);
  }
  await sql(`delete from relance_runs where at < now() - interval '60 days'`);
  if (before.last && before.late) {
    await alert('reprise', 'Rappels de paiement : la tâche automatique était arrêtée', [
      `Aucun passage entre le ${paris(before.last)} et maintenant. Elle vient de reprendre.`,
    ]);
  }
  if (/quota/.test(r.why)) {
    await alert('quota', 'Rappels de paiement : quota d’envoi atteint', [
      'Resend a refusé un mail pour quota. Les rappels sont arrêtés et reprendront seuls.',
      'Les autres mails du site (confirmations, connexions) sont peut-être refusés eux aussi.',
    ]);
  } else if (r.failed >= 3) {
    await alert('echecs', 'Rappels de paiement : plusieurs mails refusés', [`${r.failed} mails refusés au dernier passage. Voir /admin?tab=emails.`]);
  }
  return r;
}

/** Figures for the admin line: what the automatic reminders did, and what they bring in compared with the control group. */
export async function payReminderStatus() {
  const [open, clock] = await Promise.all([relanceOpen(), relanceClock()]);
  const paidAfter = `exists (select 1 from registrations p where lower(p.email) = k.email and p.status = 'paid' and p.paid_at > k.sent_at)`;
  const [s] = await sql(
    `select count(*) filter (where k.ok)::int as reminded, count(*) filter (where k.ok and ${paidAfter})::int as reminded_paid,
            count(*) filter (where k.control)::int as control, count(*) filter (where k.control and ${paidAfter})::int as control_paid,
            count(*) filter (where k.ok and k.sent_at > now() - interval '7 days')::int as week,
            count(*) filter (where not k.ok and not k.control and k.sent_at < now() - interval '10 minutes')::int as stuck
       from kai_reminders k where k.sent_at > $1`,
    [MEASURE_SINCE],
  );
  return {
    open, clock, reminded: Number(s?.reminded ?? 0), remindedPaid: Number(s?.reminded_paid ?? 0), control: Number(s?.control ?? 0),
    controlPaid: Number(s?.control_paid ?? 0), week: Number(s?.week ?? 0), stuck: Number(s?.stuck ?? 0),
  };
}
