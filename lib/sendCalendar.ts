import 'server-only';
import { sql } from './db';
import { GUEST_PAYMENT } from './guest';
import { schoolNamesOfDomains } from './conversion';

// Calendrier des envois (28/11) : les e-mails partis chaque jour, heure de Paris.
// - Smart Mail : chaque serveur envoie toutes les 10 minutes ses mails reçus par les élèves, compte par compte et heure
//   par heure (/api/smartmail/envois, script envois.py lancé par cron dans le conteneur). Aucune adresse d'élève ici.
// - Site : la table emails (connexion, confirmation, rappels de paiement, tickets…).
// - Ventes du jour, pour lire les deux côte à côte (mêmes règles que le reste de l'admin : ni invités ni tests).

export type FeedAccount = { id: number; domain: string; first_name: string; active: boolean };
export type CalendarDay = { day: string; smartmail: number; site: number; siteFailed: number; sales: number };

const SOURCE = /^smartmail-[a-z0-9-]{1,30}$/;
export const MAIL_LIST = 500; // mails du site listés un par un dans le détail d'un jour
const FIRST_HOUR = Date.UTC(2026, 0, 1) / 3_600_000; // rien avant 2026
const NOT_TEST = `coalesce(payment_id, '') not like 'mock\\_%' and coalesce(payment_id, '') not like 'cs\\_test\\_%'`;
// Début d'un jour de Paris ($n = 'AAAA-MM-JJ'), en instant.
const parisStart = (n: number) => `($${n}::date::timestamp at time zone 'Europe/Paris')`;

/** Ce qu'un serveur Smart Mail envoie : ses comptes et, pour chacun, ses mails reçus heure par heure. Remplace ce que
 *  ce serveur avait envoyé avant (une heure absente de la nouvelle liste est retirée). `planning` (28/11) : la
 *  programmation des envois de ses comptes ; absent (ancien script), celle déjà reçue est gardée. */
export async function saveSendFeed(source: string, accounts: unknown, hours: unknown, planning?: unknown) {
  if (!SOURCE.test(source) || !Array.isArray(accounts) || !Array.isArray(hours) || accounts.length > 2000 || hours.length > 200_000) return false;
  const acc: FeedAccount[] = [];
  for (const a of accounts as Record<string, unknown>[]) {
    const id = Math.trunc(Number(a?.id));
    if (!Number.isFinite(id) || id <= 0) continue;
    acc.push({ id, domain: String(a.domain ?? '').toLowerCase().slice(0, 120), first_name: String(a.first_name ?? '').slice(0, 60), active: a.active !== false });
  }
  const nowHour = Math.ceil(Date.now() / 3_600_000) + 1;
  const ids: number[] = [], hs: number[] = [], ns: number[] = [];
  for (const row of hours as unknown[]) {
    if (!Array.isArray(row) || row.length !== 3) continue;
    const [a, h, n] = row.map((x) => Math.trunc(Number(x)));
    if (!(a > 0) || !(h >= FIRST_HOUR && h <= nowHour) || !(n > 0 && n < 1_000_000)) continue;
    ids.push(a); hs.push(h); ns.push(n);
  }
  const plan = cleanPlan(planning);
  await sql(
    `insert into smartmail_send_feed (source, accounts, planning, received_at) values ($1, $2::jsonb, coalesce($3::jsonb, '[]'::jsonb), now())
     on conflict (source) do update set accounts = excluded.accounts, planning = coalesce($3::jsonb, smartmail_send_feed.planning), received_at = now()`,
    [source, JSON.stringify(acc), plan ? JSON.stringify(plan) : null],
  );
  if (!ids.length) return true; // rien à compter : on ne vide jamais un serveur sur une liste vide
  await sql(
    `insert into smartmail_sends (source, account, hour, sent)
     select $1, a, to_timestamp(h * 3600), n from unnest($2::int[], $3::int8[], $4::int[]) as t(a, h, n)
     on conflict (source, account, hour) do update set sent = excluded.sent where smartmail_sends.sent <> excluded.sent`,
    [source, ids, hs, ns],
  );
  await sql(
    `delete from smartmail_sends s where s.source = $1 and not exists (
       select 1 from unnest($2::int[], $3::int8[]) as t(a, h) where t.a = s.account and to_timestamp(t.h * 3600) = s.hour)`,
    [source, ids, hs],
  );
  return true;
}

/** Un mois (AAAA-MM) jour par jour : mails Smart Mail, mails du site (envoyés, refusés), ventes. */
export async function calendarMonth(month: string): Promise<CalendarDay[]> {
  const [y, m] = month.split('-').map(Number);
  const first = `${month}-01`;
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const [sm, site, sales] = await Promise.all([
    sql(`select (hour at time zone 'Europe/Paris')::date::text as d, sum(sent)::int as n from smartmail_sends
         where hour >= ${parisStart(1)} and hour < ${parisStart(2)} group by 1`, [first, next]),
    sql(`select (created_at at time zone 'Europe/Paris')::date::text as d,
           count(*) filter (where status = 'sent')::int as sent, count(*) filter (where status = 'failed')::int as failed
         from emails where created_at >= ${parisStart(1)} and created_at < ${parisStart(2)} group by 1`, [first, next]),
    sql(`select (coalesce(paid_at, created_at) at time zone 'Europe/Paris')::date::text as d, count(*)::int as n from registrations
         where status = 'paid' and payment_id is distinct from '${GUEST_PAYMENT}' and ${NOT_TEST}
           and coalesce(paid_at, created_at) >= ${parisStart(1)} and coalesce(paid_at, created_at) < ${parisStart(2)} group by 1`, [first, next]),
  ]);
  const by = <T,>(rows: Record<string, any>[], f: (r: Record<string, any>) => T) => new Map(rows.map((r) => [String(r.d), f(r)]));
  const smBy = by(sm, (r) => Number(r.n)), siteBy = by(site, (r) => ({ sent: Number(r.sent), failed: Number(r.failed) })), salesBy = by(sales, (r) => Number(r.n));
  return Array.from({ length: days }, (_, i) => {
    const day = `${month}-${String(i + 1).padStart(2, '0')}`;
    return { day, smartmail: smBy.get(day) ?? 0, site: siteBy.get(day)?.sent ?? 0, siteFailed: siteBy.get(day)?.failed ?? 0, sales: salesBy.get(day) ?? 0 };
  });
}

/** Le détail d'un jour (AAAA-MM-JJ) : Smart Mail compte par compte avec ses 24 heures, les mails du site. */
export async function calendarDay(day: string) {
  const next = new Date(Date.parse(`${day}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const [hours, feeds, kinds, mails, [sales]] = await Promise.all([
    sql(`select source, account, extract(hour from hour at time zone 'Europe/Paris')::int as h, sum(sent)::int as n from smartmail_sends
         where hour >= ${parisStart(1)} and hour < ${parisStart(2)} group by 1, 2, 3`, [day, next]),
    sql(`select source, accounts, received_at from smartmail_send_feed order by source`),
    sql(`select kind, status, count(*)::int as n from emails
         where created_at >= ${parisStart(1)} and created_at < ${parisStart(2)} group by 1, 2`, [day, next]),
    sql(`select id, to_email, subject, kind, status, created_at from emails
         where created_at >= ${parisStart(1)} and created_at < ${parisStart(2)} order by created_at desc limit ${MAIL_LIST}`, [day, next]),
    sql(`select count(*)::int as n from registrations
         where status = 'paid' and payment_id is distinct from '${GUEST_PAYMENT}' and ${NOT_TEST}
           and coalesce(paid_at, created_at) >= ${parisStart(1)} and coalesce(paid_at, created_at) < ${parisStart(2)}`, [day, next]),
  ]);
  const names = new Map<string, FeedAccount>();
  for (const f of feeds) for (const a of (f.accounts as FeedAccount[]) ?? []) names.set(`${f.source}:${a.id}`, a);
  const domains = [...new Set([...names.values()].map((a) => a.domain).filter(Boolean))];
  const schools = domains.length
    ? await sql(`select coalesce(nullif(short_name, ''), name) as name, email_domains from universities where email_domains && $1::text[]`, [domains])
    : [];
  const schoolOf = (domain: string) => String(schools.find((s) => (s.email_domains as string[]).map((d) => d.toLowerCase()).includes(domain))?.name ?? '');
  const accounts = new Map<string, { source: string; account: number; hours: number[]; total: number }>();
  for (const r of hours) {
    const key = `${r.source}:${r.account}`;
    const a = accounts.get(key) ?? { source: String(r.source), account: Number(r.account), hours: Array(24).fill(0), total: 0 };
    a.hours[Number(r.h)] += Number(r.n);
    a.total += Number(r.n);
    accounts.set(key, a);
  }
  return {
    accounts: [...accounts.entries()].map(([key, a]) => {
      const info = names.get(key);
      return { ...a, domain: info?.domain ?? '', firstName: info?.first_name ?? '', school: schoolOf(info?.domain ?? ''), active: info?.active ?? true };
    }).sort((a, b) => b.total - a.total),
    kinds: kinds.map((k) => ({ kind: String(k.kind), status: String(k.status), n: Number(k.n) })),
    mails,
    sales: Number(sales?.n ?? 0),
    feeds: feeds.map((f) => ({ source: String(f.source), at: new Date(f.received_at) })),
  };
}

/** Dernière fois que chaque serveur Smart Mail a donné ses chiffres. */
export async function feedFreshness() {
  const rows = await sql(`select source, received_at from smartmail_send_feed order by source`);
  return rows.map((r) => ({ source: String(r.source), at: new Date(r.received_at) }));
}

// ─── Envois programmés (28/11) ───────────────────────────────────────────────────────────────────────────────────────
// Chaque serveur Smart Mail envoie aussi la programmation de ses comptes (sa tâche d'envoi) : état, heure du prochain
// envoi, élèves par envoi, attente entre deux envois, plafond par jour, fenêtre horaire (heure de Paris), élèves restants.
// Le site en tire les envois à venir, jour par jour : une estimation (Smart Mail peut prendre du retard, être mis en pause).

export type PlanTask = {
  id: number; status: string; next: number | null; perSend: number; everyMin: number; maxDay: number;
  startHour: number; endHour: number; remaining: number; sent: number; message: string; updatedAt: string;
  collecting: number | null; // liste d'élèves en cours de collecte (contacts relevés jusqu'ici), sinon null
};
export type PlanEvent = { at: number; n: number };
export type PlanState = 'programme' | 'reconnexion' | 'retard' | 'pause' | 'erreur' | 'arrete';
export type PlannedAccount = PlanTask & {
  source: string; key: string; domain: string; firstName: string; school: string; active: boolean;
  state: PlanState; events: PlanEvent[]; perDay: number; endsAt: number | null;
};

function cleanPlan(planning: unknown): PlanTask[] | null {
  if (!Array.isArray(planning)) return null;
  const num = (v: unknown, min: number, max: number, def: number) => {
    const x = Number(v);
    return Number.isFinite(x) ? Math.trunc(Math.min(max, Math.max(min, x))) : def;
  };
  const out: PlanTask[] = [];
  for (const p of planning.slice(0, 2000) as Record<string, unknown>[]) {
    const id = Math.trunc(Number(p?.id));
    if (!Number.isFinite(id) || id <= 0) continue;
    const next = Number(p.prochain);
    out.push({
      id, status: String(p.statut ?? '').slice(0, 20),
      next: Number.isFinite(next) && next > 1.7e9 && next < 2.2e9 ? next : null,
      perSend: num(p.destinataires, 0, 100_000, 0), everyMin: num(p.attente, 0, 100_000, 0), maxDay: num(p.max_jour, 0, 1_000_000, 0),
      startHour: num(p.heure_debut, 0, 24, 0), endHour: num(p.heure_fin, 0, 24, 24),
      remaining: num(p.restants, 0, 10_000_000, 0), sent: num(p.envoyes, 0, 10_000_000, 0),
      collecting: p.collecte === null || p.collecte === undefined ? null : num(p.collecte, 0, 10_000_000, 0),
      // Texte d'état de Smart Mail (« Pack terminé… », « Microsoft a bloqué… ») : jamais une adresse.
      message: String(p.message ?? '').replace(/\S+@\S+/g, '[adresse]').slice(0, 240), updatedAt: String(p.maj ?? '').slice(0, 40),
    });
  }
  return out;
}

const parisDayOf = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date(ms));
const parisHourOf = (ms: number) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23' }).format(new Date(ms)));
const nextDay = (day: string) => new Date(Date.parse(`${day}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
/** Décalage de Paris (minutes) à cet instant. */
function parisOffset(ms: number) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(ms));
  const g = (t: string) => Number(parts.find((x) => x.type === t)?.value);
  return (Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute')) - Math.floor(ms / 60_000) * 60_000) / 60_000;
}
/** L'instant où il est `hour` h (0 à 24) à Paris le jour `day`. */
function parisAt(day: string, hour: number) {
  const guess = Date.parse(`${day}T00:00:00Z`) + hour * 3_600_000;
  return guess - parisOffset(guess) * 60_000;
}

const HORIZON = 2 * 365 * 86_400_000; // date de fin cherchée sur deux ans au plus
const MAX_EVENTS = 4000;

/** Les envois à venir d'un compte programmé : un envoi de `perSend` élèves, puis `everyMin` minutes d'attente, dans la
 *  fenêtre horaire, sans dépasser le plafond du jour ni les élèves restants. */
function project(t: PlanTask, now: number): PlanEvent[] {
  // Liste vide mais annuaire en cours de collecte : les envois sont comptés comme si elle allait se remplir.
  const total = t.remaining > 0 ? t.remaining : t.collecting !== null ? Number.POSITIVE_INFINITY : 0;
  if (t.status !== 'attente' || !t.next || t.perSend <= 0 || total <= 0) return [];
  const start = Math.min(t.startHour, 23), end = Math.max(t.endHour, start + 1);
  const every = Math.max(1, t.everyMin) * 60_000;
  const until = now + HORIZON;
  const perDay = new Map<string, number>();
  const out: PlanEvent[] = [];
  let at = Math.max(t.next * 1000, now), left = total;
  for (let guard = 0; guard < MAX_EVENTS * 3 && out.length < MAX_EVENTS && at < until && left > 0; guard++) {
    const day = parisDayOf(at), h = parisHourOf(at);
    if (h < start) { at = parisAt(day, start); continue; }
    if (h >= end) { at = parisAt(nextDay(day), start); continue; }
    const used = perDay.get(day) ?? 0;
    const cap = t.maxDay > 0 ? t.maxDay - used : Number.POSITIVE_INFINITY;
    if (cap <= 0) { at = parisAt(nextDay(day), start); continue; }
    const n = Math.min(t.perSend, left, cap);
    out.push({ at, n });
    perDay.set(day, used + n);
    left -= n;
    at += every;
  }
  return out;
}

const STATE_ORDER: Record<PlanState, number> = { programme: 0, reconnexion: 1, retard: 2, erreur: 3, pause: 4, arrete: 5 };
const LATE = 60 * 60_000; // prochain envoi dépassé de plus d'une heure : le compte n'enverra pas tout seul

/** La programmation de tous les comptes Smart Mail, avec leurs envois à venir. */
export async function sendPlan(): Promise<PlannedAccount[]> {
  const now = Date.now();
  const feeds = await sql(`select source, accounts, planning from smartmail_send_feed order by source`);
  const rows: PlannedAccount[] = [];
  for (const f of feeds) {
    const accounts = new Map(((f.accounts as FeedAccount[]) ?? []).map((a) => [a.id, a]));
    for (const t of (f.planning as PlanTask[]) ?? []) {
      const info = accounts.get(t.id);
      // « attente » veut dire programmé seulement si l'heure du prochain envoi n'est pas dépassée (BSB, 28/11 : prochain
      // envoi le 26/11 mais en attente de la reconnexion de l'ambassadeur).
      const due = t.next !== null && t.next * 1000 >= now - LATE;
      const state: PlanState = t.status === 'attente' ? (due ? 'programme' : /reconnex/i.test(t.message) ? 'reconnexion' : 'retard')
        : t.status === 'pause' ? 'pause' : t.status === 'erreur' ? 'erreur' : 'arrete';
      const events = state === 'programme' ? project(t, now) : [];
      const start = Math.min(t.startHour, 23), end = Math.max(t.endHour, start + 1);
      const packs = t.everyMin >= 1380 ? 1 : Math.max(1, Math.floor(((end - start) * 60) / Math.max(1, t.everyMin)));
      const left = t.remaining > 0 ? t.remaining : t.collecting !== null ? Number.POSITIVE_INFINITY : 0;
      const perDay = state === 'programme' ? Math.min(t.maxDay > 0 ? t.maxDay : Number.POSITIVE_INFINITY, t.perSend * packs, left) : 0;
      const done = t.remaining > 0 && events.reduce((s, e) => s + e.n, 0) >= t.remaining;
      rows.push({
        ...t, source: String(f.source), key: `${f.source}:${t.id}`, domain: info?.domain ?? '', firstName: info?.first_name ?? '', school: '',
        active: info?.active ?? true, state, events, perDay, endsAt: done && events.length ? events[events.length - 1].at : null,
      });
    }
  }
  const names = await schoolNamesOfDomains([...new Set(rows.map((r) => r.domain).filter(Boolean))]);
  for (const r of rows) r.school = names.get(r.domain.toLowerCase()) ?? '';
  return rows.sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || (a.events[0]?.at ?? Infinity) - (b.events[0]?.at ?? Infinity) || b.remaining - a.remaining);
}

/** Envois à venir par jour de Paris (AAAA-MM-JJ → e-mails), d'après la programmation. */
export function plannedByDay(plan: PlannedAccount[]) {
  const days = new Map<string, number>();
  for (const a of plan) for (const e of a.events) days.set(parisDayOf(e.at), (days.get(parisDayOf(e.at)) ?? 0) + e.n);
  return days;
}
