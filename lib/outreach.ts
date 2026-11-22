import 'server-only';
import { randomUUID } from 'node:crypto';
import { sql } from './db';
import { normaliseLinkedin, registerProspect } from './calls';
import { siteUrl } from './site';

// LinkedIn prospecting for ambassadors. The script on the admin's Mac does the LinkedIn work (search, invite, message,
// repost) and reports here; /admin › Prospection shows the funnel and sets the plan (quotas, schools, message, pause).

export type OutreachConfig = {
  paused: boolean;
  invitesPerDay: number; // invitations without a note
  weeklyCap: number;
  messagesPerDay: number; // messages after acceptance
  repostPerDay: number;
  schools: string[]; // order in which schools are prospected
  perSchool: number; // 1st-to-3rd-year students to find in each school
  searchesPerDay: number; // LinkedIn people searches a day (the free account has a monthly search cap)
  message: string; // {prenom} {ecole} ({lien} still works; the message now asks where the student prefers to talk)
  inviteNote: string; // short note on the invitation (Premium); empty = no note
  followUpAfterDays: number; // one reminder when the student has not answered the message (0 = never)
  followUp: string; // {prenom} {ecole} {lien}
  withdrawAfterDays: number; // invitations still pending after this are withdrawn (keeps the acceptance rate healthy)
  searchCooldownDays: number; // a school searched without enough results waits this long before the next search
};

// LinkedIn's limits for a young free account: about 100 invitations a week. Hard ceilings the admin cannot pass.
// Ceilings for all the LinkedIn accounts together (about 100 invitations a week each; 2 accounts today).
export const LIMITS = { invitesPerDay: 50, weeklyCap: 200, messagesPerDay: 120, repostPerDay: 4, perSchool: 10, searchesPerDay: 30 };

export const DEFAULT_CONFIG: OutreachConfig = {
  paused: false,
  invitesPerDay: 30,
  weeklyCap: 200,
  messagesPerDay: 80,
  repostPerDay: 4,
  schools: ["HEC Paris", "Audencia", "KEDGE Business School", "Grenoble École de Management (GEM)", "TBS Education", "Rennes School of Business", "Montpellier Business School", "ICN Business School", "EM Strasbourg", "BSB – Burgundy School of Business", "EM Normandie", "Excelia", "ESC Clermont Business School", "IMT Business School", "Brest Business School", "ESC Pau Business School", "Y Schools", "INSEEC Grande École", "PSB Paris School of Business", "ISC Paris", "EDC Paris Business School", "ESCE", "IPAG Business School", "EBS Paris", "ESDES", "ISTEC", "ICD Business School", "IDRAC Business School", "ESG", "ISG", "EMLV – De Vinci", "ESLSCA", "Albert School", "MBway", "ESGCI", "PPA Business School", "IFAG", "ISEG", "ESAM", "Université Paris Dauphine-PSL", "IAE Paris-Sorbonne Business School", "IAE Gustave Eiffel", "ISM-IAE Versailles Saint-Quentin", "IAE Paris-Saclay", "iaelyon", "IAE Aix-Marseille", "IAE Bordeaux", "IAE Lille", "TSM – Toulouse School of Management", "IAE Nantes", "Grenoble IAE", "MOMA – Montpellier Management", "IAE Nice", "IAE Caen", "IAE Rouen Normandie", "IAE Tours", "IAE Poitiers", "IGR-IAE Rennes", "IAE Brest", "IAE Bretagne Sud", "IAE Dijon", "IAE Besançon", "IAE Metz", "IAE Nancy", "IAE Savoie Mont Blanc", "IAE Saint-Étienne", "IAE Clermont Auvergne", "IAE La Rochelle", "IAE Pau-Bayonne", "IAE Amiens", "IAE Limoges", "IAE Orléans", "IAE Valenciennes", "IAE Toulon", "IAE Perpignan", "IAE Corse", "IAE Réunion", "EMD Business School", "ESCD 3A", "ISCID-CO", "American Business School Paris", "Schiller International University", "Ascencia Business School", "PSTB – Paris School of Technology & Business", "ISEFAC Bachelor", "EIML Paris", "Sup de Luxe", "Vatel", "Euridis Business School", "ECEMA", "NEGOSUP", "ESPI", "IPAC Bachelor Factory", "ESARC Évolution", "EGC – réseau des écoles de gestion et de commerce (CCI)", "Institut Paul Bocuse", "ESTA", "École de Management de la Sorbonne (Paris 1)", "Faculté d'Économie et de Gestion d'Aix-Marseille", "IAE Le Mans"],
  perSchool: 5,
  searchesPerDay: 20,
  inviteNote: 'Bonjour {prenom}, on a lancé une certification IA à mettre sur LinkedIn et sur son CV. On la développe avec un réseau d’ambassadeurs (Polytechnique, ESSEC, ESCP et 25 autres) et {ecole} nous intéresse particulièrement. Je t’explique tout en 5 min si tu acceptes !',
  followUpAfterDays: 4,
  followUp: 'Bonjour {prenom}, je me permets de te relancer : {ecole} nous intéresse toujours pour notre réseau d’ambassadeurs. 5 min suffisent pour tout t’expliquer, donne-moi juste le contact qui t’arrange (WhatsApp, Insta, Teams ou autre) et on s’appelle rapidement.',
  withdrawAfterDays: 21,
  searchCooldownDays: 7,
  message: 'Bonjour {prenom}, on a lancé une certification IA qui permet aux étudiants de prouver leurs compétences en la mettant sur LinkedIn et sur leur CV. Pour la développer, on se base sur un réseau d’ambassadeurs, on les cherche dans toutes les écoles de commerce et d’ingé. On a déjà Polytechnique, l’ESSEC, l’ESCP et 25 autres. {ecole} nous intéresse particulièrement. En plus, être ambassadeur, tu pourras le valoriser comme compétence. J’aimerais t’expliquer tout ça en 5 min : donne-moi le contact qui te convient pour qu’on puisse s’appeler rapidement, Teams, WhatsApp, Insta ou autre, là où t’es le plus à l’aise.',
};

const clamp = (n: unknown, max: number, def: number) => Math.max(0, Math.min(max, Math.round(Number(n)) || 0)) || (Number(n) === 0 ? 0 : def);

export async function getConfig(): Promise<OutreachConfig> {
  const [row] = await sql('select data from outreach_config where id = 1');
  const c = { ...DEFAULT_CONFIG, ...((row?.data as Partial<OutreachConfig>) ?? {}) };
  return {
    ...c,
    invitesPerDay: clamp(c.invitesPerDay, LIMITS.invitesPerDay, DEFAULT_CONFIG.invitesPerDay),
    weeklyCap: clamp(c.weeklyCap, LIMITS.weeklyCap, DEFAULT_CONFIG.weeklyCap),
    messagesPerDay: clamp(c.messagesPerDay, LIMITS.messagesPerDay, DEFAULT_CONFIG.messagesPerDay),
    repostPerDay: clamp(c.repostPerDay, LIMITS.repostPerDay, DEFAULT_CONFIG.repostPerDay),
    perSchool: clamp(c.perSchool, LIMITS.perSchool, DEFAULT_CONFIG.perSchool),
    searchesPerDay: clamp(c.searchesPerDay, LIMITS.searchesPerDay, DEFAULT_CONFIG.searchesPerDay),
    followUpAfterDays: clamp(c.followUpAfterDays, 30, DEFAULT_CONFIG.followUpAfterDays),
    withdrawAfterDays: clamp(c.withdrawAfterDays, 60, DEFAULT_CONFIG.withdrawAfterDays),
    searchCooldownDays: clamp(c.searchCooldownDays, 60, DEFAULT_CONFIG.searchCooldownDays),
  };
}

export async function saveConfig(patch: Partial<OutreachConfig>) {
  const next = { ...(await getConfig()), ...patch };
  await sql(
    `insert into outreach_config (id, data) values (1, $1) on conflict (id) do update set data = excluded.data`,
    [JSON.stringify(next)],
  );
}

/** What the script may still do today and this week (Paris day). */
export async function budget() {
  const config = await getConfig();
  const [c] = await sql(`
    select
      count(*) filter (where invited_at >= date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris')::int as invites_today,
      count(*) filter (where invited_at >= now() - interval '7 days')::int as invites_week,
      count(*) filter (where messaged_at >= date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris')::int as messages_today
    from outreach_prospects`);
  const [r] = await sql(`select count(*)::int as n from outreach_log where kind = 'repost' and at >= date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris'`);
  return {
    config,
    invitesLeft: config.paused ? 0 : Math.max(0, Math.min(config.invitesPerDay - c.invites_today, config.weeklyCap - c.invites_week)),
    messagesLeft: config.paused ? 0 : Math.max(0, config.messagesPerDay - c.messages_today),
    repostsLeft: config.paused ? 0 : Math.max(0, config.repostPerDay - r.n),
    today: { invites: c.invites_today, messages: c.messages_today, reposts: r.n, invitesWeek: c.invites_week },
  };
}

export type ProspectIn = { linkedin: string; name?: string; school?: string; headline?: string };

/** New prospects found by the script (already known ones are left as they are). Each gets its personal /call link. */
export async function addProspects(list: ProspectIn[]) {
  let added = 0;
  for (const p of list.slice(0, 200)) {
    const linkedin = normaliseLinkedin(p.linkedin);
    if (!linkedin) continue;
    const name = String(p.name ?? '').trim().slice(0, 120);
    const [first, ...rest] = name.split(/\s+/);
    const token = await registerProspect({ linkedin, first_name: first ?? '', last_name: rest.join(' '), school: p.school ?? '' });
    const res = await sql(
      `insert into outreach_prospects (linkedin, name, first_name, school, headline, token) values ($1, $2, $3, $4, $5, $6)
       on conflict (linkedin) do nothing returning linkedin`,
      [linkedin, name, first ?? '', String(p.school ?? '').slice(0, 120), String(p.headline ?? '').slice(0, 300), token],
    );
    added += res.length;
  }
  return added;
}

export type Prospect = { linkedin: string; name: string; first_name: string; school: string; headline: string; token: string | null; status: string;
  found_at: string; invited_at: string | null; accepted_at: string | null; messaged_at: string | null; booked_at: string | null; error: string; link: string; contact: string; contact_at: string | null; contacted_at: string | null };

export async function prospects(status: string | null, limit = 200): Promise<Prospect[]> {
  const rows = status
    ? await sql('select * from outreach_prospects where status = $1 order by found_at limit $2', [status, limit])
    : await sql('select * from outreach_prospects order by coalesce(booked_at, messaged_at, accepted_at, invited_at, found_at) desc limit $1', [limit]);
  return rows.map((r) => ({ ...(r as Omit<Prospect, 'link'>), link: r.token ? `${siteUrl()}/call?t=${r.token}` : `${siteUrl()}/call` }));
}

const STAMP: Record<string, string> = { invited: 'invited_at', accepted: 'accepted_at', messaged: 'messaged_at', booked: 'booked_at', declined: 'declined_at', withdrawn: 'withdrawn_at' };
// Final states: nothing ever moves a refused student back into a queue.
const FINAL = ['declined'];

export async function setStatus(linkedinUrl: string, status: string, error = '') {
  const linkedin = normaliseLinkedin(linkedinUrl);
  const col = STAMP[status];
  await sql(
    `update outreach_prospects set status = $2, error = $3${col ? `, ${col} = coalesce(${col}, now())` : ''} where linkedin = $1 and (status <> all($4) or $2 = any($4))`,
    [linkedin, status, error.slice(0, 300), FINAL],
  );
}

/** The student gave a way to reach them (Instagram, WhatsApp, phone…): kept, and the prospect moves to “contact”. */
export async function setContact(linkedinUrl: string, contact: string) {
  await sql(
    `update outreach_prospects set status = 'contact', contact = $2, contact_at = coalesce(contact_at, now()) where linkedin = $1 and status <> all($3)`,
    [normaliseLinkedin(linkedinUrl), contact.trim().slice(0, 200), FINAL],
  );
}

/** Students who gave a contact, the ones still to call first. */
export async function contacts(): Promise<Prospect[]> {
  const rows = await sql(`select * from outreach_prospects where contact <> '' order by (contacted_at is not null), contact_at desc limit 200`);
  return rows.map((r) => ({ ...(r as Omit<Prospect, 'link'>), link: r.token ? `${siteUrl()}/call?t=${r.token}` : `${siteUrl()}/call` }));
}

/** How many gave a contact and have not been called yet (the red dot of the admin). */
export async function toContactCount() {
  const [r] = await sql(`select count(*)::int as n from outreach_prospects where contact <> '' and contacted_at is null and status <> 'declined'`);
  return r.n as number;
}

/** Pierre called (or wrote to) the student on the contact they gave; `done = false` puts them back in the list to call. */
export async function markContacted(linkedinUrl: string, done = true) {
  await sql(`update outreach_prospects set contacted_at = ${done ? 'coalesce(contacted_at, now())' : 'null'} where linkedin = $1`, [normaliseLinkedin(linkedinUrl)]);
}

/** The follow-up went out (the student stays “messaged”). */
export async function markFollowedUp(linkedinUrl: string) {
  await sql('update outreach_prospects set followed_up_at = now() where linkedin = $1', [normaliseLinkedin(linkedinUrl)]);
}

/** A school was searched: remembered so it is not searched again before searchCooldownDays. */
export async function recordSearch(school: string, found: number) {
  await sql(
    `insert into outreach_school_search (school, searched_at, found) values ($1, now(), $2)
     on conflict (school) do update set searched_at = now(), found = excluded.found`,
    [school.slice(0, 200), found],
  );
}

/** Schools searched recently (within searchCooldownDays) — the script skips them. */
export async function recentlySearched(days: number) {
  const rows = await sql(`select school from outreach_school_search where searched_at > now() - make_interval(days => $1::int)`, [days]);
  return rows.map((r) => String(r.school));
}

export async function log(kind: string, text: string) {
  await sql('insert into outreach_log (id, kind, text) values ($1, $2, $3)', [randomUUID(), kind.slice(0, 30), text.slice(0, 500)]);
}

/** True the first time in `hours` hours for this kind of alert (and remembers it): one e-mail, not one per run. */
export async function firstAlert(kind: string, hours: number) {
  const [r] = await sql(`select count(*)::int as n from outreach_log where kind = $1 and at > now() - make_interval(hours => $2::int)`, [kind, hours]);
  if (r.n > 0) return false;
  await log(kind, 'Alerte envoyée par e-mail');
  return true;
}

export async function recentLog(limit = 40) {
  return sql('select kind, text, at from outreach_log order by at desc limit $1', [limit]);
}

export async function funnel() {
  const rows = await sql('select status, count(*)::int as n from outreach_prospects group by status');
  const by = Object.fromEntries(rows.map((r) => [r.status, r.n]));
  return {
    found: by.found ?? 0, invited: by.invited ?? 0, accepted: by.accepted ?? 0, messaged: by.messaged ?? 0,
    booked: by.booked ?? 0, contact: by.contact ?? 0, failed: by.failed ?? 0, declined: by.declined ?? 0, withdrawn: by.withdrawn ?? 0, total: rows.reduce((s, r) => s + r.n, 0),
  };
}

/** Called when someone books from a personal link: the prospect moves to “booked”. */
export async function markBookedByToken(token: string | null) {
  if (!token) return;
  await sql(`update outreach_prospects set status = 'booked', booked_at = coalesce(booked_at, now()) where token = $1 and status <> 'declined'`, [token]);
}

/** How many prospects each school already has (any status): the script fills the schools still short of perSchool. */
export async function schoolCounts() {
  const rows = await sql('select school, count(*)::int as n from outreach_prospects group by school');
  return Object.fromEntries(rows.map((r) => [String(r.school), r.n])) as Record<string, number>;
}

/** Day-by-day activity over the last 14 days (Paris days) and the state of each school, for the visual panel. */
export async function visuals() {
  const days = await sql(`
    with d as (select generate_series(0, 13) as i)
    select to_char((now() at time zone 'Europe/Paris')::date - d.i, 'YYYY-MM-DD') as day,
      (select count(*) from outreach_prospects where (invited_at at time zone 'Europe/Paris')::date = (now() at time zone 'Europe/Paris')::date - d.i)::int as invited,
      (select count(*) from outreach_prospects where (accepted_at at time zone 'Europe/Paris')::date = (now() at time zone 'Europe/Paris')::date - d.i)::int as accepted
    from d order by day`);
  const schools = await sql(`
    select school,
      count(*)::int as listed,
      count(*) filter (where invited_at is not null)::int as invited,
      count(*) filter (where accepted_at is not null)::int as accepted,
      count(*) filter (where status = 'booked')::int as booked
    from outreach_prospects group by school`);
  return { days, schools };
}
