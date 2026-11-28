import 'server-only';
import { sql } from './db';
import { GUEST_PAYMENT } from './guest';
import type { FeedAccount } from './sendCalendar';

// Taux de conversion par école (28/11) : les e-mails Smart Mail reçus par les élèves d'une école, face aux ventes de
// cette école, sur une période (heure de Paris).
// - École d'un compte Smart Mail : le domaine de son adresse, cherché dans les domaines des écoles du site (exact ou
//   sous-domaine : etu.umontpellier.fr → umontpellier.fr). À défaut, l'école que choisissent le plus souvent les inscrits
//   qui ont ce domaine (mbs-education.com…). Sinon le domaine seul, signalé.
// - Ventes : inscriptions payées (ni invités ni tests, mêmes règles que le reste de l'admin), à la date du paiement,
//   rangées sous l'école choisie à l'inscription.
// - Note de A à E selon le nombre d'e-mails qu'il faut pour une vente (GRADES).

export type Period = 'tout' | '30j' | '7j' | 'hier' | 'jour';
export const PERIODS: { id: Period; label: string }[] = [
  { id: 'tout', label: 'Depuis le début' },
  { id: '30j', label: '30 derniers jours' },
  { id: '7j', label: '7 derniers jours' },
  { id: 'hier', label: 'Hier' },
  { id: 'jour', label: 'Aujourd’hui' },
];
export const isPeriod = (p: string): p is Period => PERIODS.some((x) => x.id === p);

export type Grade = 'A' | 'B' | 'C' | 'D' | 'E';
/** La note : au plus `perSale` e-mails pour une vente (A = 1 vente pour 200 e-mails ou moins, soit 0,5 % et plus). */
export const GRADES: { grade: Grade; perSale: number }[] = [
  { grade: 'A', perSale: 200 },
  { grade: 'B', perSale: 400 },
  { grade: 'C', perSale: 800 },
  { grade: 'D', perSale: 2000 },
  { grade: 'E', perSale: Infinity },
];
/** En dessous de ce nombre d'e-mails, la note n'est qu'indicative (une vente de plus ou de moins la change). */
export const MIN_SAMPLE = 300;

export function gradeOf(mails: number, sales: number): Grade | null {
  if (mails <= 0) return null;
  if (sales <= 0) return 'E';
  return GRADES.find((g) => mails / sales <= g.perSale)!.grade;
}

export type SchoolConversion = {
  key: string; // id de l'école du site, ou « domaine:… » quand aucune école ne correspond
  name: string;
  fullName: string;
  known: boolean;
  domains: string[]; // domaines des comptes Smart Mail qui écrivent à cette école
  accounts: number;
  mails: number;
  sales: number;
  rate: number | null; // ventes / e-mails, en %
  perSale: number | null; // e-mails pour une vente
  grade: Grade | null;
  indicative: boolean;
  series: { mails: number[]; sales: number[] };
};

export type Conversion = {
  period: Period;
  from: string; // premier jour (AAAA-MM-JJ, Paris)
  to: string; // dernier jour inclus
  buckets: string[]; // jours (AAAA-MM-JJ) ou heures (« 0 » à « 23 ») pour une période d'un jour
  hourly: boolean;
  schools: SchoolConversion[];
  mails: number;
  sales: number;
  salesContacted: number; // ventes des écoles qui ont reçu des e-mails sur la période
  accounts: number;
  rate: number | null;
  perSale: number | null;
  grade: Grade | null;
};

const NOT_TEST = `coalesce(payment_id, '') not like 'mock\\_%' and coalesce(payment_id, '') not like 'cs\\_test\\_%'`;
const PAID = `status = 'paid' and payment_id is distinct from '${GUEST_PAYMENT}' and ${NOT_TEST}`;
const parisStart = (n: number) => `($${n}::date::timestamp at time zone 'Europe/Paris')`;
const FIRST_DAY = '2026-01-01'; // rien avant 2026 (comme le calendrier)
const MAX_DAYS = 62; // jours dessinés au plus dans la petite courbe de chaque école
// Boîtes personnelles : jamais devinées d'après les inscrits (gmail.com n'est l'adresse d'aucune école).
// Domaines d'élèves absents des écoles du site, rattachés à la main (domaine des étudiants ≠ domaine officiel).
const DOMAIN_SCHOOL: Record<string, string> = {
  'mbs-education.com': 'f308addc-3aa5-4713-93f9-a628716aba1d', // Montpellier Business School (montpellier-bs.com)
};
const GENERIC = /^(gmail|googlemail|outlook|hotmail|live|msn|yahoo|ymail|icloud|me|mac|aol|proton|protonmail|pm|gmx|laposte|orange|free|sfr|wanadoo)\.[a-z.]+$/;

export const parisDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
export const shiftDay = (day: string, by: number) => new Date(Date.parse(`${day}T12:00:00Z`) + by * 86_400_000).toISOString().slice(0, 10);

function bounds(period: Period, today: string) {
  switch (period) {
    case 'jour': return { from: today, to: today };
    case 'hier': return { from: shiftDay(today, -1), to: shiftDay(today, -1) };
    case '7j': return { from: shiftDay(today, -6), to: today };
    case '30j': return { from: shiftDay(today, -29), to: today };
    default: return { from: FIRST_DAY, to: today };
  }
}

const matches = (domain: string, schoolDomain: string) => {
  const d = schoolDomain.toLowerCase();
  return domain === d || domain.endsWith(`.${d}`) || d.endsWith(`.${domain}`);
};

export async function conversionBySchool(period: Period): Promise<Conversion> {
  const today = parisDay();
  const { from, to } = bounds(period, today);
  const end = shiftDay(to, 1);
  const hourly = from === to;
  const bucket = (col: string) => (hourly
    ? `extract(hour from ${col} at time zone 'Europe/Paris')::int::text`
    : `(${col} at time zone 'Europe/Paris')::date::text`);
  const paidAt = 'coalesce(paid_at, created_at)';

  const [sends, sales, feeds, unis] = await Promise.all([
    sql(`select source, account, ${bucket('hour')} as b, sum(sent)::int as n from smartmail_sends
         where hour >= ${parisStart(1)} and hour < ${parisStart(2)} group by 1, 2, 3`, [from, end]),
    sql(`select university_id::text as u, ${bucket(paidAt)} as b, count(*)::int as n from registrations
         where ${PAID} and ${paidAt} >= ${parisStart(1)} and ${paidAt} < ${parisStart(2)} group by 1, 2`, [from, end]),
    sql(`select source, accounts from smartmail_send_feed`),
    sql(`select id::text as id, coalesce(nullif(short_name, ''), name) as name, name as full_name, email_domains
         from universities where cardinality(email_domains) > 0`),
  ]);

  // Comptes Smart Mail → domaine → école.
  const accountInfo = new Map<string, FeedAccount>();
  for (const f of feeds) for (const a of (f.accounts as FeedAccount[]) ?? []) accountInfo.set(`${f.source}:${a.id}`, a);
  const domainOf = (source: string, account: number) => String(accountInfo.get(`${source}:${account}`)?.domain ?? '').toLowerCase();
  const domains = [...new Set(sends.map((r) => domainOf(String(r.source), Number(r.account))).filter(Boolean))];

  const uniBy = new Map<string, { name: string; fullName: string }>();
  for (const u of unis) uniBy.set(String(u.id), { name: String(u.name), fullName: String(u.full_name) });
  const schoolOfDomain = new Map<string, string>(); // domaine → id d'école
  for (const domain of domains) {
    let best: { id: string; len: number } | null = null;
    for (const u of unis) {
      for (const d of (u.email_domains as string[]) ?? []) {
        if (matches(domain, d) && (!best || d.length > best.len)) best = { id: String(u.id), len: d.length };
      }
    }
    if (best) schoolOfDomain.set(domain, best.id);
    else if (DOMAIN_SCHOOL[domain]) schoolOfDomain.set(domain, DOMAIN_SCHOOL[domain]);
  }
  const guess = domains.filter((d) => !schoolOfDomain.has(d) && !GENERIC.test(d));
  if (guess.length) {
    const rows = await sql(
      `select dom, r.university_id::text as u, count(*)::int as n
         from registrations r join unnest($1::text[]) as dom
           on lower(split_part(r.email, '@', 2)) = dom or lower(split_part(r.email, '@', 2)) like '%.' || dom
        where ${NOT_TEST.replaceAll('payment_id', 'r.payment_id')}
        group by 1, 2 order by 1, 3 desc`,
      [guess],
    );
    for (const r of rows) if (!schoolOfDomain.has(String(r.dom))) schoolOfDomain.set(String(r.dom), String(r.u));
  }
  // Noms des écoles qui manquent encore (écoles sans domaine : ventes, écoles devinées).
  const missing = [...new Set([...sales.map((r) => String(r.u)), ...schoolOfDomain.values()])].filter((id) => id && !uniBy.has(id));
  if (missing.length) {
    for (const u of await sql(`select id::text as id, coalesce(nullif(short_name, ''), name) as name, name as full_name
                               from universities where id::text = any($1::text[])`, [missing])) {
      uniBy.set(String(u.id), { name: String(u.name), fullName: String(u.full_name) });
    }
  }

  // Cases de la petite courbe : 24 heures, ou les jours de la période (pour « depuis le début », à partir du premier
  // jour où il s'est passé quelque chose, MAX_DAYS au plus).
  let buckets: string[];
  let first = from; // premier jour affiché (« depuis le … »)
  if (hourly) buckets = Array.from({ length: 24 }, (_, i) => String(i));
  else {
    if (period === 'tout') first = [...sends.map((r) => String(r.b)), ...sales.map((r) => String(r.b))].sort()[0] ?? today;
    let start = first;
    if (start < shiftDay(to, -(MAX_DAYS - 1))) start = shiftDay(to, -(MAX_DAYS - 1));
    buckets = [];
    for (let d = start; d <= to; d = shiftDay(d, 1)) buckets.push(d);
  }
  const slot = new Map(buckets.map((b, i) => [b, i]));

  const schools = new Map<string, SchoolConversion & { accountKeys: Set<string>; domainSet: Set<string> }>();
  const school = (key: string, domain = '') => {
    let s = schools.get(key);
    if (!s) {
      const uni = uniBy.get(key);
      s = {
        key, name: uni?.name ?? (domain || 'École inconnue'), fullName: uni?.fullName ?? '', known: !!uni, domains: [], accounts: 0,
        mails: 0, sales: 0, rate: null, perSale: null, grade: null, indicative: false,
        series: { mails: Array(buckets.length).fill(0), sales: Array(buckets.length).fill(0) }, accountKeys: new Set(), domainSet: new Set(),
      };
      schools.set(key, s);
    }
    return s;
  };

  for (const r of sends) {
    const domain = domainOf(String(r.source), Number(r.account));
    const s = school(schoolOfDomain.get(domain) ?? `domaine:${domain || 'inconnu'}`, domain);
    const n = Number(r.n);
    s.mails += n;
    s.accountKeys.add(`${r.source}:${r.account}`);
    if (domain) s.domainSet.add(domain);
    const i = slot.get(String(r.b));
    if (i !== undefined) s.series.mails[i] += n;
  }
  for (const r of sales) {
    const s = school(String(r.u));
    const n = Number(r.n);
    s.sales += n;
    const i = slot.get(String(r.b));
    if (i !== undefined) s.series.sales[i] += n;
  }

  const list: SchoolConversion[] = [...schools.values()].map(({ accountKeys, domainSet, ...s }) => ({
    ...s,
    accounts: accountKeys.size,
    domains: [...domainSet].sort(),
    rate: s.mails ? (s.sales / s.mails) * 100 : null,
    perSale: s.mails && s.sales ? s.mails / s.sales : null,
    grade: gradeOf(s.mails, s.sales),
    indicative: s.mails > 0 && s.mails < MIN_SAMPLE,
  }));

  const mails = list.reduce((t, s) => t + s.mails, 0);
  const salesAll = list.reduce((t, s) => t + s.sales, 0);
  const salesContacted = list.filter((s) => s.mails > 0).reduce((t, s) => t + s.sales, 0);
  return {
    period, from: first, to, buckets, hourly,
    schools: list,
    mails, sales: salesAll, salesContacted,
    accounts: list.reduce((t, s) => t + s.accounts, 0),
    rate: mails ? (salesContacted / mails) * 100 : null,
    perSale: mails && salesContacted ? mails / salesContacted : null,
    grade: gradeOf(mails, salesContacted),
  };
}
