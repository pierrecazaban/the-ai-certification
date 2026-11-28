import 'server-only';
import { sql } from './db';
import { GUEST_PAYMENT } from './guest';

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
 *  ce serveur avait envoyé avant (une heure absente de la nouvelle liste est retirée). */
export async function saveSendFeed(source: string, accounts: unknown, hours: unknown) {
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
  await sql(
    `insert into smartmail_send_feed (source, accounts, received_at) values ($1, $2::jsonb, now())
     on conflict (source) do update set accounts = excluded.accounts, received_at = now()`,
    [source, JSON.stringify(acc)],
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
