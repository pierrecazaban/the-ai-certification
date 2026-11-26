import 'server-only';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { sql } from './db';
import { setting } from './settings';
import { DEFAULT_CONFIG, getConfig, log, type OutreachConfig } from './outreach';
import { normaliseLinkedin } from './calls';
import { cleanContacts, NETWORK_LABEL, type CleanContact, type ContactNetwork, type RawContact } from './contactNormalize';
import { sendOutreachAlert } from './email';

// Prospection LinkedIn à plusieurs comptes (26/11, demande de Pierre) : son compte et ceux des ambassadeurs qui se
// connectent. Ici : la base d'écoles qui grandit sans fin, la couverture (une école qui a un ambassadeur connecté n'est
// plus prospectée), la répartition des écoles entre les comptes, les comptes eux-mêmes, et le registre des messages
// d'étudiants (chaque message reçoit une décision : rien ne se perd en silence).

export const PIERRE = 'pierre';
const ACCOUNT_RE = /^(pierre|hippolyte|amb-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isAccountId = (v: unknown): v is string => typeof v === 'string' && ACCOUNT_RE.test(v);
export const ambAccountId = (userId: string) => `amb-${userId.toLowerCase()}`;
export const isAmbAccount = (id: string) => id.startsWith('amb-');
const accountOr = (v: unknown) => (isAccountId(v) ? v : PIERRE);
const DAY = 864e5;

// ---------------------------------------------------------------- écoles

/** The key that makes two spellings of one school the same row: accents, case, punctuation and brackets aside. */
export function schoolKey(name: string) {
  return String(name ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' et ').replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Écoles couvertes d'office (liste de Pierre, mémoire du 16/11) : fiches exactes de la base du site, et les deux entrées
// d'Aix-Marseille de l'ancienne liste de prospection (toutes les facultés d'AMU sont couvertes).
const COVERED_AT_START = [
  '94c51031-69d5-43e5-aad0-20ec89e239b0', // EDHEC Business School
  '34839d62-d3f4-4fe1-8319-4d2d126b570a', // ESCP Business School
  '64fbb526-2e37-4b3e-bfb2-1070dd79173d', // ESSCA
  '7a6a5b54-32c3-4d88-bd1d-160b155e20a9', // ESSEC Business School
  '5490c8e0-9271-419e-820c-e67d5d751220', // IÉSEG
  '826a2869-d10b-49e0-a6fa-1a525f42523d', // NEOMA Business School
  'cc5a68c4-d50c-4fc5-805b-76788601b320', // SKEMA Business School
  '831e374a-f072-44fa-9c51-f838b56fafab', // emlyon business school
  'a2fda746-601f-5c8e-bcd5-4e633490dca6', // Aix-Marseille Université
  '7e283c44-4f82-4829-9297-7aa3309bf3f7', // IAE Aix-Marseille
  'a5610a08-a6f0-5155-8a77-58d650b3bcf5', // École polytechnique
];
const COVERED_NAMES_AT_START = ['IAE Aix-Marseille', 'Faculté d’Économie et de Gestion d’Aix-Marseille', "Faculté d'Économie et de Gestion d'Aix-Marseille"].map(schoolKey);
const SEED_VERSION = '2026-11-26-2';
// Corrections de la base (26/11) : le domaine des adresses étudiantes d'aujourd'hui manque à certaines écoles du site
// (leurs ambassadeurs Smart Mail ne les couvraient pas), et la production a créé une deuxième fiche à partir de ce
// domaine. La vraie école reçoit le domaine, le doublon est mis de côté (jamais prospecté).
const DOMAIN_FIXES: Record<string, string[]> = {
  'montpellier business school': ['mbs-education.com'],
  'amos sport business school': ['amos-school.com'],
};
// Facultés, IAE et écoles internes d'une université (26/11, règle de Pierre du 16/11 : une université couverte l'est avec
// toutes ses facultés, comme AMU) : couvertes dès que leur université l'est. Seulement les rattachements sûrs.
const PART_OF: Record<string, string> = {
  'iae paris sorbonne': 'universite paris 1 pantheon sorbonne',
  'ecole de management de la sorbonne': 'universite paris 1 pantheon sorbonne',
  'iae montpellier': 'universite de montpellier',
  'montpellier management': 'universite de montpellier', // « MOMA – Montpellier Management » de l'ancienne liste (sigle ôté de la clé)
  'polytech montpellier': 'universite de montpellier',
  'polytech marseille': 'aix marseille universite',
  'iae aix marseille': 'aix marseille universite',
  'faculte d economie et de gestion d aix marseille': 'aix marseille universite',
};
const DUPLICATE_OF: Record<string, string> = {
  'mbs education': 'montpellier business school',
  'amos school': 'amos sport business school',
};

type SchoolRow = { id: string; name: string; key: string; city: string; source: string; university_id: string | null };

/**
 * The base starts from the French schools of the site (with their email domains) and Pierre's old target list, once.
 * After that it only grows: schools found by the daily discovery, typed by students, or seen in Smart Mail.
 */
export async function ensureSchoolBase() {
  const [done] = await sql(`select value from schema_meta where key = 'prospect_schools_seed'`).catch(() => []);
  if (done?.value === SEED_VERSION) return;
  const unis = await sql(`select id::text as id, name, state, email_domains from universities where active and timezone = 'Europe/Paris'`);
  const rows: { id: string; name: string; key: string; city: string; university_id: string | null; domains: string[]; source: string; covered: boolean | null }[] = [];
  const byKey = new Map<string, (typeof rows)[number]>();
  for (const u of unis) {
    const key = schoolKey(String(u.name));
    if (!key || byKey.has(key)) continue;
    const r = { id: randomUUID(), name: String(u.name), key, city: String(u.state ?? ''), university_id: String(u.id), domains: (u.email_domains as string[]) ?? [], source: 'site', covered: COVERED_AT_START.includes(String(u.id)) ? true : null };
    rows.push(r);
    byKey.set(key, r);
  }
  // Pierre's list: a name already in the base (same key, or one name containing the other) is not added twice.
  const config = await getConfig();
  for (const name of [...new Set([...(config.schools ?? []), ...DEFAULT_CONFIG.schools])]) {
    const key = schoolKey(name.replace(/^(BSB|EMLV|TSM|MOMA|PSTB|EGC)\s*[–—-]\s*/, ''));
    if (!key) continue;
    const same = byKey.get(key) ?? rows.find((r) => r.key.length > 6 && key.length > 6 && (` ${r.key} `.includes(` ${key} `) || ` ${key} `.includes(` ${r.key} `)));
    if (same) { if (same.source === 'site') same.source = 'site+liste'; continue; }
    const r = { id: randomUUID(), name, key, city: '', university_id: null, domains: [], source: 'liste', covered: COVERED_NAMES_AT_START.includes(schoolKey(name)) ? true : null };
    rows.push(r);
    byKey.set(key, r);
  }
  await sql(
    `insert into prospect_schools (id, name, key, city, university_id, email_domains, source, covered_manual)
     select x.id, x.name, x.key, x.city, x.university_id, array(select jsonb_array_elements_text(x.domains)), x.source, x.covered
       from jsonb_to_recordset($1::jsonb) as x(id uuid, name text, key text, city text, university_id uuid, domains jsonb, source text, covered boolean)
     on conflict (key) do nothing`,
    [JSON.stringify(rows)],
  );
  for (const [key, domains] of Object.entries(DOMAIN_FIXES)) {
    await sql(`update prospect_schools set email_domains = array(select distinct d from unnest(email_domains || $2::text[]) as d) where key = $1`, [key, domains]);
  }
  for (const [dup, main] of Object.entries(DUPLICATE_OF)) {
    await sql(`update prospect_schools set paused = true, assigned_to = null, assigned_at = null, source = case when source like '%doublon%' then source else source || ' (doublon de ' || $2 || ')' end where key = $1`, [dup, main]);
  }
  await sql(`insert into schema_meta (key, value) values ('prospect_schools_seed', $1) on conflict (key) do update set value = excluded.value`, [SEED_VERSION]);
  await log('écoles', `Base d’écoles initialisée : ${rows.length} écoles (site et ancienne liste)`);
}

const PERSONAL = /^(gmail|googlemail|outlook|hotmail|live|yahoo|icloud|me|orange|free|sfr|laposte|wanadoo|proton|protonmail|gmx|aol)\./;
const sameOrg = (a: string, b: string) => !!a && !!b && (a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`));

/**
 * Schools that have an ambassador, with the reason: a Smart Mail account (either server), a site ambassador whose
 * address is from the school, a school held in the ambassador space, or Pierre's choice. A contact given by a student
 * of the school never counts (Pierre, 26/11): only a connected ambassador does.
 */
export async function coverage(): Promise<Map<string, string>> {
  await ensureSchoolBase();
  const [schools, feeds, amb, claims] = await Promise.all([
    sql(`select s.id::text as id, s.key, s.name, s.covered_manual, s.university_id::text as university_id,
                case when cardinality(s.email_domains) > 0 then s.email_domains else coalesce(u.email_domains, '{}') end as domains
           from prospect_schools s left join universities u on u.id = s.university_id`),
    sql(`select source, domains from coverage_feed where received_at > now() - interval '3 days'`),
    sql(`select distinct lower(split_part(u.email, '@', 2)) as d from users u join ambassadors a on a.user_id = u.id where u.role = 'ambassador' and u.email like '%@%'`),
    sql(`select university_id::text as id from school_claims`),
  ]);
  const sm: { d: string; source: string }[] = [];
  for (const f of feeds) for (const d of (Array.isArray(f.domains) ? f.domains : []) as string[]) {
    const dom = String(d).toLowerCase().trim();
    if (dom && !PERSONAL.test(dom)) sm.push({ d: dom, source: String(f.source) });
  }
  const site = amb.map((r) => String(r.d)).filter((d) => d && !PERSONAL.test(d) && !d.endsWith('no-email.invalid'));
  const held = new Set(claims.map((r) => String(r.id)));
  const out = new Map<string, string>();
  for (const s of schools) {
    if (s.covered_manual === false) continue;
    if (s.covered_manual === true) { out.set(String(s.id), 'liste de Pierre'); continue; }
    const doms = ((s.domains as string[]) ?? []).map((d) => String(d).toLowerCase());
    const bySm = sm.find((x) => doms.some((d) => sameOrg(x.d, d)));
    if (bySm) { out.set(String(s.id), `compte Smart Mail (${bySm.d})`); continue; }
    const bySite = site.find((x) => doms.some((d) => sameOrg(x, d)));
    if (bySite) { out.set(String(s.id), `ambassadeur du site (${bySite})`); continue; }
    if (s.university_id && held.has(String(s.university_id))) out.set(String(s.id), 'école tenue dans l’espace ambassadeur');
  }
  // A faculty follows its university (unless Pierre decided otherwise for it).
  const byKey = new Map(schools.map((s) => [String(s.key), s]));
  for (const [child, parent] of Object.entries(PART_OF)) {
    const c = byKey.get(child);
    const p = byKey.get(parent);
    if (c && p && c.covered_manual !== false && !out.has(String(c.id)) && out.has(String(p.id))) out.set(String(c.id), `fait partie de ${p.name}`);
  }
  return out;
}

/** What Smart Mail says (every 10 min, per server): the domains of its ambassadors' addresses, nothing else. */
export async function saveCoverageFeed(source: string, domains: unknown) {
  const src = String(source).replace(/[^a-z0-9-]/gi, '').slice(0, 30);
  if (!src) return false;
  const list = [...new Set((Array.isArray(domains) ? domains : []).map((d) => String(d).toLowerCase().trim()).filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)))].slice(0, 500);
  await sql(
    `insert into coverage_feed (source, domains, received_at) values ($1, $2::jsonb, now())
     on conflict (source) do update set domains = excluded.domains, received_at = now()`,
    [src, JSON.stringify(list)],
  );
  return true;
}

const LEASE_DAYS = 7;
export type AssignedSchool = { id: string; name: string; city: string; cursor: Record<string, unknown> };

/**
 * The schools an account prospects now. Each school belongs to one account at a time (lease of 7 days, then it rotates):
 * no two accounts search the same school, and the base is spread over all of them. Covered, paused or exhausted schools
 * are let go at once. An ambassador gets schools of their city first; Pierre's old list comes before the rest.
 */
export async function assignedSchools(account: string, want: number, homeCity = ''): Promise<AssignedSchool[]> {
  const covered = await coverage();
  const mine = await sql(
    `select id::text as id, name, city, cursor, assigned_at, exhausted_until, paused from prospect_schools where assigned_to = $1`, [account]);
  const now = Date.now();
  const keep: AssignedSchool[] = [];
  const letGo: string[] = [];
  for (const s of mine) {
    const stale = !s.assigned_at || now - new Date(s.assigned_at).getTime() > LEASE_DAYS * DAY;
    const exhausted = s.exhausted_until && new Date(s.exhausted_until).getTime() > now;
    if (covered.has(String(s.id)) || s.paused || exhausted || stale || keep.length >= want) letGo.push(String(s.id));
    else keep.push({ id: String(s.id), name: String(s.name), city: String(s.city ?? ''), cursor: (s.cursor as Record<string, unknown>) ?? {} });
  }
  if (letGo.length) await sql(`update prospect_schools set assigned_to = null, assigned_at = null where id = any($1::uuid[]) and assigned_to = $2`, [letGo, account]);
  if (keep.length >= want) return keep;
  const order = (await getConfig()).schools.map(schoolKey);
  const rank = new Map(order.map((k, i) => [k, i]));
  const candidates = (await sql(
    `select id::text as id, name, key, city, cursor, found, searches, last_searched_at, source from prospect_schools
      where not paused and (exhausted_until is null or exhausted_until < now())
        and (assigned_to is null or assigned_at < now() - make_interval(days => $1::int))
      limit 5000`, [LEASE_DAYS],
  )).filter((s) => !covered.has(String(s.id)) && !letGo.includes(String(s.id)));
  const city = homeCity.trim().toLowerCase();
  const score = (s: (typeof candidates)[number]) => [
    city && String(s.city ?? '').toLowerCase() === city ? 0 : 1,
    rank.has(String(s.key)) ? 0 : 1,
    rank.get(String(s.key)) ?? 0,
    Number(s.searches ?? 0),
    s.last_searched_at ? new Date(s.last_searched_at).getTime() : 0,
  ];
  candidates.sort((a, b) => {
    const x = score(a), y = score(b);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return Math.random() - 0.5;
  });
  for (const c of candidates) {
    if (keep.length >= want) break;
    // Taken only if still free: two accounts asking at the same moment cannot both get it.
    const [got] = await sql(
      `update prospect_schools set assigned_to = $1, assigned_at = now()
        where id = $2 and (assigned_to is null or assigned_to = $1 or assigned_at < now() - make_interval(days => $3::int))
        returning id`, [account, c.id, LEASE_DAYS]);
    if (got) keep.push({ id: String(c.id), name: String(c.name), city: String(c.city ?? ''), cursor: (c.cursor as Record<string, unknown>) ?? {} });
  }
  return keep;
}

/**
 * One LinkedIn search done for a school: where the next one starts, how many new students it gave. A school whose
 * searches all came back empty rests 30 days (new students arrive every year), then comes back by itself.
 */
export async function recordSchoolSearch(input: { schoolId: unknown; account: unknown; cursor: unknown; foundNew: unknown; exhausted: unknown }) {
  const id = String(input.schoolId ?? '');
  if (!UUID_RE.test(id)) return false;
  const cursor = input.cursor && typeof input.cursor === 'object' ? JSON.stringify(input.cursor).slice(0, 500) : '{}';
  const exhausted = input.exhausted === true;
  await sql(
    `update prospect_schools set cursor = $2::jsonb, searches = searches + 1, found = found + $3, last_searched_at = now(),
       exhausted_until = case when $4 then now() + interval '30 days' else exhausted_until end,
       assigned_to = case when $4 then null else assigned_to end, assigned_at = case when $4 then null else assigned_at end
     where id = $1`,
    [id, exhausted ? '{}' : cursor, Math.max(0, Math.min(1000, Math.round(Number(input.foundNew) || 0))), exhausted],
  );
  if (exhausted) {
    const [s] = await sql('select name from prospect_schools where id = $1', [id]);
    await log('écoles', `${s?.name ?? 'Une école'} : plus de nouvel étudiant trouvé, reprise dans 30 jours (${accountOr(input.account)})`);
  }
  return true;
}

export type DiscoveredSchool = { name?: unknown; city?: unknown; domain?: unknown; source?: unknown; evidence?: unknown };

/** New schools for the base (discovery, students, Smart Mail): a school already there (same key) is never added twice. */
// Words that say nothing of which school it is (same list as the agent's): « Business School » alone is no school.
const GENERIC = new Set(['universite', 'university', 'ecole', 'school', 'business', 'management', 'institut', 'institute', 'de', 'des', 'la', 'le', 'les',
  'du', 'd', 'l', 'et', 'and', 'of', 'the', 'en', 'faculte', 'faculty', 'sciences', 'science', 'superieure', 'superieur', 'nationale', 'national',
  'grande', 'groupe', 'campus', 'education', 'paris', 'reseau', 'ecoles', 'gestion', 'commerce']);
const distinctWords = (key: string) => key.split(' ').filter((w) => w.length > 1 && !GENERIC.has(w)).length;
/**
 * Same school written another way: same key, or one name inside the other when the words left over are only generic
 * ones (« KEDGE » = « KEDGE Business School », but « Sciences Po » ≠ « Sciences Po Grenoble »).
 */
export function sameSchool(a: string, b: string) {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (distinctWords(short) === 0 || !` ${long} `.includes(` ${short} `)) return false;
  const rest = ` ${long} `.replace(` ${short} `, ' ').trim();
  return distinctWords(rest) === 0;
}

export async function addDiscoveredSchools(list: DiscoveredSchool[], defaultSource = 'découverte') {
  await ensureSchoolBase();
  const rows = [];
  const keys = new Set<string>();
  const existing = (await sql('select key from prospect_schools')).map((r) => String(r.key));
  for (const s of (Array.isArray(list) ? list : []).slice(0, 200)) {
    const name = String(s?.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
    const key = schoolKey(name);
    if (name.length < 3 || key.length < 3 || keys.has(key) || distinctWords(key) === 0) continue;
    if (existing.some((k) => sameSchool(k, key))) continue;
    keys.add(key);
    const domain = String(s?.domain ?? '').toLowerCase().trim().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
    rows.push({
      id: randomUUID(), name, key, city: String(s?.city ?? '').trim().slice(0, 80),
      domains: /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) && !PERSONAL.test(domain) ? [domain] : [],
      source: String(s?.source ?? defaultSource).slice(0, 30),
    });
  }
  if (!rows.length) return 0;
  const added = await sql(
    `insert into prospect_schools (id, name, key, city, email_domains, source)
     select x.id, x.name, x.key, x.city, array(select jsonb_array_elements_text(x.domains)), x.source
       from jsonb_to_recordset($1::jsonb) as x(id uuid, name text, key text, city text, domains jsonb, source text)
     on conflict (key) do nothing returning name`,
    [JSON.stringify(rows)],
  );
  if (added.length) await log('écoles', `${added.length} école(s) ajoutée(s) à la base : ${added.slice(0, 8).map((r) => r.name).join(', ')}${added.length > 8 ? '…' : ''}`);
  return added.length;
}

/** What the daily discovery needs: the names already in the base, and the names seen elsewhere but not in it yet. */
export async function discoveryInput() {
  await ensureSchoolBase();
  const names = (await sql('select name from prospect_schools order by name')).map((r) => String(r.name));
  const keys = new Set(names.map(schoolKey));
  const typed = await sql(
    `select distinct trim(other_university_name) as name from waitlist
      where coalesce(trim(other_university_name), '') <> '' and created_at > now() - interval '90 days' limit 200`);
  const feeds = await sql(`select domains from coverage_feed`);
  const known = await sql(`select coalesce(nullif(s.email_domains, '{}'), u.email_domains, '{}') as d from prospect_schools s left join universities u on u.id = s.university_id`);
  const domains = known.flatMap((r) => (r.d as string[]) ?? []).map((d) => String(d).toLowerCase());
  const unknownDomains = [...new Set(feeds.flatMap((f) => (f.domains as string[]) ?? []).map((d) => String(d).toLowerCase()))]
    .filter((d) => !PERSONAL.test(d) && !domains.some((k) => sameOrg(d, k)));
  return {
    names,
    candidates: [
      ...typed.map((r) => String(r.name)).filter((n) => !keys.has(schoolKey(n)) && ![...keys].some((k) => sameSchool(k, schoolKey(n)))).map((name) => ({ name, source: 'inscriptions' })),
      ...unknownDomains.map((domain) => ({ domain, source: 'smart mail' })),
    ],
  };
}

/** The base as the admin sees it: how many schools in each state, the latest added, the covered ones with the reason. */
export async function schoolBaseSummary() {
  const covered = await coverage();
  const rows = await sql(
    `select id::text as id, name, city, source, paused, assigned_to, exhausted_until, found, searches, added_at, covered_manual from prospect_schools order by added_at desc`);
  const now = Date.now();
  const state = (s: (typeof rows)[number]) =>
    covered.has(String(s.id)) ? 'couverte' : s.paused ? 'en pause' : s.exhausted_until && new Date(s.exhausted_until).getTime() > now ? 'au repos' : s.assigned_to ? 'en cours' : 'à prospecter';
  const counts: Record<string, number> = { total: rows.length, 'à prospecter': 0, 'en cours': 0, couverte: 0, 'au repos': 0, 'en pause': 0 };
  for (const s of rows) counts[state(s)] = (counts[state(s)] ?? 0) + 1;
  return {
    counts,
    latest: rows.slice(0, 12).map((s) => ({ id: String(s.id), name: String(s.name), city: String(s.city ?? ''), source: String(s.source), added_at: s.added_at, state: state(s) })),
    covered: rows.filter((s) => covered.has(String(s.id))).map((s) => ({ id: String(s.id), name: String(s.name), reason: covered.get(String(s.id)) ?? '', manual: s.covered_manual })).sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    active: rows.filter((s) => s.assigned_to && !covered.has(String(s.id))).map((s) => ({ id: String(s.id), name: String(s.name), account: String(s.assigned_to), found: Number(s.found), searches: Number(s.searches) })),
  };
}

/** Admin: a school forced covered or not (null = automatic again), paused or not, or a school added by hand. */
export async function setSchoolFlags(id: string, patch: { covered?: boolean | null; paused?: boolean }) {
  if (!UUID_RE.test(id)) return false;
  if (patch.covered !== undefined) await sql('update prospect_schools set covered_manual = $2 where id = $1', [id, patch.covered]);
  if (patch.paused !== undefined) await sql('update prospect_schools set paused = $2, assigned_to = case when $2 then null else assigned_to end where id = $1', [id, patch.paused]);
  return true;
}

// ---------------------------------------------------------------- comptes

export type AccountRow = { id: string; user_id: string | null; name: string; linkedin_url: string; status: string; reason: string;
  consent_at: string | null; connected_at: string | null; started_at: string | null; last_pass_at: string | null; created_at: string; updated_at: string };

/** Pierre's account always exists (it was the only one before the 26/11). */
export async function ensurePierreAccount() {
  await sql(
    `insert into prospect_accounts (id, name, status, started_at, connected_at) values ('pierre', 'Pierre', 'active', now() - interval '30 days', now())
     on conflict (id) do nothing`);
}

export async function accountRow(id: string): Promise<AccountRow | null> {
  const [r] = await sql('select * from prospect_accounts where id = $1', [id]);
  return (r as AccountRow) ?? null;
}

/** An ambassador's school city (to prospect near home first) from their address or the school they hold. */
async function homeCityOf(userId: string | null) {
  if (!userId) return '';
  const [r] = await sql(
    `select coalesce(
       (select un.state from school_claims c join universities un on un.id = c.university_id where c.user_id = u.id limit 1),
       (select un.state from universities un, unnest(un.email_domains) d
         where split_part(lower(u.email), '@', 2) = lower(d) or split_part(lower(u.email), '@', 2) like '%.' || lower(d) order by length(d) desc limit 1),
       '') as city
     from users u where u.id = $1`, [userId]);
  return String(r?.city ?? '');
}

/**
 * Ramp-up of an ambassador's account (LinkedIn watches young automated accounts): 5 invitations a day the first week,
 * 10 the second, then 15 at most, 70 a week, no note, 10 searches a day. Pierre's account keeps the plan of /admin.
 */
function ambassadorLimits(startedAt: string | null) {
  const days = startedAt ? (Date.now() - new Date(startedAt).getTime()) / DAY : 0;
  return { invitesPerDay: days < 7 ? 5 : days < 14 ? 10 : 15, weeklyCap: 70, searchesPerDay: 10, messagesPerDay: 20 };
}

async function counts(account: string) {
  const [c] = await sql(`
    select
      count(*) filter (where invited_at >= date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris')::int as invites_today,
      count(*) filter (where invited_at >= now() - interval '7 days')::int as invites_week,
      count(*) filter (where messaged_at >= date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris')::int as messages_today
    from outreach_prospects where account = $1`, [account]);
  return { invites_today: Number(c?.invites_today ?? 0), invites_week: Number(c?.invites_week ?? 0), messages_today: Number(c?.messages_today ?? 0) };
}

/**
 * The plan of one account for the script: its quotas for today, its schools, the covered schools (never prospected,
 * first message included) and what the script may do with it. Without `account`: Pierre's, as before the 26/11.
 */
export async function accountPlan(accountId: unknown) {
  const account = accountOr(accountId);
  await ensurePierreAccount();
  const config = await getConfig();
  const acc = await accountRow(account);
  const amb = isAmbAccount(account);
  const c = await counts(account);
  const lim = amb ? ambassadorLimits(acc?.started_at ?? null) : { invitesPerDay: config.invitesPerDay, weeklyCap: config.weeklyCap, searchesPerDay: config.searchesPerDay, messagesPerDay: config.messagesPerDay };
  const enabled = amb ? config.ambEnabled === true && acc?.status === 'active' : true;
  const paused = config.paused || !enabled;
  const [r] = await sql(`select count(*)::int as n from outreach_log where kind = 'repost' and at >= date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris'`);
  const covered = await coverage();
  const coveredRows = covered.size ? await sql(`select id::text as id, name, key from prospect_schools where id = any($1::uuid[])`, [[...covered.keys()]]) : [];
  const schools = paused ? [] : await assignedSchools(account, amb ? 3 : 6, amb ? await homeCityOf(acc?.user_id ?? null) : '');
  const [ready] = await sql(`select count(*)::int as n from outreach_prospects where account = $1 and status = 'found'`, [account]);
  return {
    config: { ...config, ...lim, inviteNote: amb ? '' : config.inviteNote, repostPerDay: amb ? 0 : config.repostPerDay, paused },
    invitesLeft: paused ? 0 : Math.max(0, Math.min(lim.invitesPerDay - c.invites_today, lim.weeklyCap - c.invites_week)),
    messagesLeft: paused ? 0 : Math.max(0, lim.messagesPerDay - c.messages_today),
    repostsLeft: paused || amb ? 0 : Math.max(0, config.repostPerDay - Number(r?.n ?? 0)),
    today: { invites: c.invites_today, messages: c.messages_today, reposts: Number(r?.n ?? 0), invitesWeek: c.invites_week },
    account: { id: account, name: acc?.name ?? (account === PIERRE ? 'Pierre' : ''), kind: amb ? 'ambassador' : 'owner', status: acc?.status ?? 'active' },
    // Searches keep the waiting list at 3 days of invitations: it never runs dry, and searches are not wasted.
    ready: Number(ready?.n ?? 0),
    wantReady: lim.invitesPerDay * 3,
    schools,
    covered: coveredRows.map((s) => ({ id: String(s.id), name: String(s.name), key: String(s.key) })),
    features: { reposts: !amb, autoReply: !amb, withdraw: true, inviteNote: !amb },
  };
}

/** For the Paris service: the ambassadors' accounts it runs, and whether ambassador prospection is on. */
export async function accountsForServer() {
  const config = await getConfig();
  const rows = await sql(
    `select a.id, a.user_id::text as user_id, a.name, a.status, a.reason from prospect_accounts a
      where a.id like 'amb-%' and a.status in ('connecting', 'active', 'paused', 'stop_requested') order by a.created_at`);
  return { accounts: rows, settings: { enabled: config.ambEnabled === true, maxBrowsers: 2, maxAccounts: config.ambMaxAccounts ?? 10 } };
}

/**
 * The Paris service reports an account: connected (active, with the LinkedIn profile it opened), paused by a LinkedIn
 * signal, or stopped (its browser profile erased after the ambassador asked). Nothing else can be set from there.
 */
export async function setAccountStatus(input: { id?: unknown; user_id?: unknown; status?: unknown; linkedin_url?: unknown; name?: unknown; reason?: unknown }) {
  const id = String(input.id ?? '');
  // Fin de passage : n'importe quel compte (celui de Pierre compris) note l'heure de son dernier passage.
  if (input.status === 'pass' && isAccountId(id)) {
    await sql(`update prospect_accounts set last_pass_at = now() where id = $1`, [id]);
    return { ok: true };
  }
  if (!isAccountId(id) || !isAmbAccount(id)) return { ok: false, error: 'compte inconnu' };
  const uid = id.slice(4);
  if (input.user_id !== undefined && String(input.user_id).toLowerCase() !== uid) return { ok: false, error: 'compte et utilisateur ne correspondent pas' };
  const status = String(input.status ?? '');
  const reason = String(input.reason ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  const acc = await accountRow(id);
  if (!acc) return { ok: false, error: 'compte inconnu' };
  if (status === 'active') {
    if (!['connecting', 'active', 'paused'].includes(acc.status)) return { ok: false, error: `compte ${acc.status}` };
    const url = normaliseLinkedin(String(input.linkedin_url ?? ''));
    if (!url) return { ok: false, error: 'profil LinkedIn manquant' };
    // The same LinkedIn profile cannot run for two ambassadors (or for Pierre).
    const [twin] = await sql(`select id from prospect_accounts where linkedin_url = $1 and id <> $2 and status not in ('stopped')`, [url, id]);
    if (twin) return { ok: false, error: 'ce profil LinkedIn est déjà relié à un autre compte' };
    await sql(
      `update prospect_accounts set status = 'active', reason = '', linkedin_url = $2, name = $3, connected_at = now(),
         started_at = coalesce(started_at, now()), updated_at = now() where id = $1`,
      [id, url, String(input.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 120) || acc.name]);
    await log('compte', `${String(input.name ?? acc.name)} a relié son LinkedIn à la prospection (${url})`);
    return { ok: true };
  }
  if (status === 'paused') {
    if (acc.status !== 'active' && acc.status !== 'connecting') return { ok: true };
    await sql(`update prospect_accounts set status = 'paused', reason = $2, updated_at = now() where id = $1`, [id, reason || 'arrêt de sécurité']);
    await log('compte', `Prospection de ${acc.name || id} mise en pause : ${reason || 'arrêt de sécurité'}`);
    await sendOutreachAlert({ subject: `Prospection : le compte LinkedIn de ${acc.name || 'un ambassadeur'} est en pause`, lines: [reason || 'Arrêt de sécurité.', 'Rien ne repart tant que l’ambassadeur ne s’est pas reconnecté.'] }).catch(() => {});
    return { ok: true };
  }
  if (status === 'stopped') {
    if (acc.status !== 'stop_requested') return { ok: false, error: 'arrêt non demandé' };
    await sql(`update prospect_accounts set status = 'stopped', reason = 'arrêté par l’ambassadeur, connexion effacée', updated_at = now() where id = $1`, [id]);
    await sql(`update prospect_schools set assigned_to = null, assigned_at = null where assigned_to = $1`, [id]);
    await log('compte', `Prospection de ${acc.name || id} arrêtée, connexion LinkedIn effacée du serveur`);
    return { ok: true };
  }
  return { ok: false, error: 'état inconnu' };
}

/** Signed for the Paris service (shared key): this ambassador may open the live LinkedIn sign-in for 10 minutes. */
export async function liveToken(accountId: string) {
  const key = await setting('CALLS_API_KEY');
  if (!key || key.length < 24) return null;
  const body = Buffer.from(JSON.stringify({ acc: accountId, uid: accountId.slice(4), exp: Math.floor(Date.now() / 1000) + 600, n: randomBytes(12).toString('hex') })).toString('base64url');
  return `${body}.${createHmac('sha256', key).update(body).digest('hex')}`;
}
export const LIVE_URL = () => process.env.PROSPECTION_LIVE_URL || 'wss://prospection.2-25-7-244.sslip.io/direct';

/**
 * The ambassador asks to connect (consent given in their space): the account is created or reopened, and a signed
 * pass for the live sign-in is returned. Refused when ambassador prospection is off or the pilot is full.
 */
export async function requestConnect(user: { id: string; first_name: string; last_name: string; role: string }) {
  if (user.role !== 'ambassador') return { ok: false as const, error: 'reserved' };
  const config = await getConfig();
  if (config.ambEnabled !== true) return { ok: false as const, error: 'off' };
  const id = ambAccountId(user.id);
  const acc = await accountRow(id);
  if (!acc || acc.status === 'stopped') {
    const [n] = await sql(`select count(*)::int as n from prospect_accounts where id like 'amb-%' and status in ('connecting', 'active', 'paused')`);
    if (Number(n?.n ?? 0) >= (config.ambMaxAccounts ?? 10)) return { ok: false as const, error: 'full' };
  }
  if (acc?.status === 'stop_requested') return { ok: false as const, error: 'stopping' };
  await sql(
    `insert into prospect_accounts (id, user_id, name, status, consent_at) values ($1, $2, $3, 'connecting', now())
     on conflict (id) do update set status = case when prospect_accounts.status in ('stopped', 'connecting') then 'connecting' else prospect_accounts.status end,
       consent_at = now(), updated_at = now()`,
    [id, user.id, `${user.first_name} ${user.last_name}`.trim()]);
  const token = await liveToken(id);
  if (!token) return { ok: false as const, error: 'key' };
  return { ok: true as const, token, url: LIVE_URL(), account: id };
}

/** The ambassador stops: nothing more runs in their name, and the Paris service erases their LinkedIn connection. */
export async function requestStop(userId: string) {
  const id = ambAccountId(userId);
  await sql(`update prospect_accounts set status = 'stop_requested', reason = 'arrêt demandé par l’ambassadeur', updated_at = now()
              where id = $1 and status in ('connecting', 'active', 'paused')`, [id]);
  await sql(`update prospect_schools set assigned_to = null, assigned_at = null where assigned_to = $1`, [id]);
  return true;
}

/** Admin: pause or resume one account (Pierre's included). */
export async function adminSetAccount(id: string, action: 'pause' | 'resume') {
  if (!isAccountId(id)) return false;
  if (action === 'pause') await sql(`update prospect_accounts set status = 'paused', reason = 'mis en pause par l’admin', updated_at = now() where id = $1 and status in ('active', 'connecting')`, [id]);
  else await sql(`update prospect_accounts set status = 'active', reason = '', updated_at = now() where id = $1 and status = 'paused' and (id = 'pierre' or linkedin_url <> '')`, [id]);
  return true;
}

/** Every account with what it did, for /admin › Prospection. */
export async function accountsOverview() {
  await ensurePierreAccount();
  return sql(`
    select a.id, a.name, a.status, a.reason, a.linkedin_url, a.connected_at, a.last_pass_at, a.started_at, u.email,
      (select count(*)::int from outreach_prospects p where p.account = a.id and p.invited_at >= date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris') as invites_today,
      (select count(*)::int from outreach_prospects p where p.account = a.id and p.invited_at >= now() - interval '7 days') as invites_week,
      (select count(*)::int from outreach_prospects p where p.account = a.id and p.invited_at is not null) as invited,
      (select count(*)::int from outreach_prospects p where p.account = a.id and p.accepted_at is not null) as accepted,
      (select count(*)::int from prospect_contacts c where c.account = a.id) as contacts,
      (select count(*)::int from prospect_contacts c where c.account = a.id and c.status in ('new', 'verify')) as contacts_todo,
      (select string_agg(s.name, ', ' order by s.name) from prospect_schools s where s.assigned_to = a.id) as schools
    from prospect_accounts a left join users u on u.id = a.user_id
    where a.status <> 'stopped' or a.updated_at > now() - interval '30 days'
    order by (a.id = 'pierre') desc, a.created_at`);
}

// ---------------------------------------------------------------- prospects d'un compte

/** All the students an account ever contacted, to recognise any conversation, however old (no 30-day limit). */
export async function prospectIndex(accountId: unknown) {
  const account = accountOr(accountId);
  const rows = await sql(
    `select linkedin, name, first_name, school, school_id::text as school_id, status, invited_at, accepted_at, messaged_at, followed_up_at, token, urn
       from outreach_prospects where account = $1 order by coalesce(messaged_at, accepted_at, invited_at, found_at) desc limit 5000`, [account]);
  return rows;
}

const URN_RE = /^[A-Za-z0-9_-]{20,80}$/;
/** The LinkedIn internal id of a prospect, read in the conversation it was written to (only set once, never changed). */
export async function recordUrn(accountId: unknown, linkedinUrl: unknown, urn: unknown) {
  const linkedin = normaliseLinkedin(String(linkedinUrl ?? ''));
  const u = String(urn ?? '').replace(/^.*\/in\//, '').replace(/[/?#].*$/, '');
  if (!linkedin || !URN_RE.test(u)) return false;
  const rows = await sql(
    `update outreach_prospects set urn = $2 where linkedin = $1 and account = $3 and (urn is null or urn = '')
        and not exists (select 1 from outreach_prospects o where o.urn = $2 and o.linkedin <> $1) returning linkedin`,
    [linkedin, u, accountOr(accountId)]);
  return rows.length > 0;
}

// ---------------------------------------------------------------- registre des messages et contacts

const OUTCOMES = ['contact', 'none', 'verify', 'declined', 'error'] as const;
type Outcome = (typeof OUTCOMES)[number];
const MSG_RE = /^[a-z0-9-]{4,64}$/i;

/** The student messages the script saw in conversations: each one must later get a decision (see `reconcile`). */
export async function markSeen(accountId: unknown, items: unknown) {
  const account = accountOr(accountId);
  const list = (Array.isArray(items) ? items : []).slice(0, 200)
    .map((x) => ({ linkedin: normaliseLinkedin(String((x as { linkedin?: unknown })?.linkedin ?? '')), msg: String((x as { msg?: unknown })?.msg ?? '') }))
    .filter((x) => x.linkedin && MSG_RE.test(x.msg));
  if (!list.length) return 0;
  const rows = await sql(
    `insert into prospect_messages (linkedin, msg, account) select x.linkedin, x.msg, $2 from jsonb_to_recordset($1::jsonb) as x(linkedin text, msg text)
     on conflict (linkedin, msg) do nothing returning msg`, [JSON.stringify(list), account]);
  return rows.length;
}

/**
 * The decision for one student message, sent by the script after Claude read it: contacts given (cleaned and checked
 * again here), a refusal, nothing, or “to check” for Pierre (or the ambassador). Recorded before the script marks the
 * message done, so a failure here means the message is read again at the next pass.
 */
export async function recordAnalysis(input: {
  linkedin?: unknown; account?: unknown; msg?: unknown; outcome?: unknown; contacts?: unknown; text?: unknown; fromImage?: unknown; name?: unknown; school?: unknown; note?: unknown;
}) {
  const linkedin = normaliseLinkedin(String(input.linkedin ?? ''));
  const msg = String(input.msg ?? '');
  if (!linkedin || !MSG_RE.test(msg)) return { ok: false, error: 'message inconnu' };
  const account = accountOr(input.account);
  const [p] = await sql('select linkedin, name, school, account, status, contacted_at from outreach_prospects where linkedin = $1', [linkedin]);
  if (!p) return { ok: false, error: 'prospect inconnu' };
  if (String(p.account) !== account) return { ok: false, error: 'prospect d’un autre compte' };
  const text = String(input.text ?? '').slice(0, 4000);
  const fromImage = input.fromImage === true;
  const contacts: CleanContact[] = cleanContacts((Array.isArray(input.contacts) ? input.contacts : []) as RawContact[], text, fromImage);
  let outcome: Outcome = (OUTCOMES as readonly string[]).includes(String(input.outcome)) ? (String(input.outcome) as Outcome) : 'none';
  if (contacts.length) outcome = contacts.every((c) => c.ok) ? 'contact' : 'verify';
  const note = String(input.note ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  const excerpt = outcome === 'verify' || outcome === 'error' ? `${note ? `${note} — ` : ''}${text.replace(/\s+/g, ' ').trim()}`.slice(0, 400) : '';

  const fresh: CleanContact[] = [];
  for (const c of contacts) {
    const [row] = await sql(
      `insert into prospect_contacts (id, linkedin, account, network, value, normalized, quote, status, source)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) on conflict (linkedin, network, normalized) do nothing returning id`,
      // Pierre already wrote to this student (marked in /admin before the 26/11): the contact comes in as « written ».
      [randomUUID(), linkedin, account, c.network, c.value, c.normalized || c.value.toLowerCase(), (c.quote || text).slice(0, 500), p.contacted_at ? 'contacted' : c.ok ? 'new' : 'verify', fromImage ? 'image' : 'auto']);
    if (row) fresh.push(c);
  }
  await sql(
    `insert into prospect_messages (linkedin, msg, account, analyzed_at, outcome, excerpt, attempts) values ($1, $2, $3, now(), $4, $5, 1)
     on conflict (linkedin, msg) do update set analyzed_at = now(), outcome = excluded.outcome, excerpt = excluded.excerpt, attempts = prospect_messages.attempts + 1`,
    [linkedin, msg, account, outcome, excerpt]);

  if (fresh.length) {
    // The prospect's own line (old screens and counters): first contact shown, status “contact” (even after a refusal:
    // a student who gives a contact has changed their mind).
    const shown = fresh.map((c) => `${NETWORK_LABEL[c.network as ContactNetwork]} : ${c.value}`).join(' · ').slice(0, 200);
    await sql(
      `update outreach_prospects set status = 'contact', contact = case when contact = '' then $2 else contact end, contact_at = coalesce(contact_at, now()) where linkedin = $1`,
      [linkedin, shown]);
    const who = `${p.name} (${p.school})`;
    await log('contact', `${who} : ${shown}${fresh.some((c) => !c.ok) ? ' (à vérifier)' : ''}${isAmbAccount(account) ? ` · compte ${account}` : ''}`);
    await sendOutreachAlert({
      subject: `Prospection : ${p.name || 'un étudiant'} a donné son contact`, linkedin,
      lines: [`${who} : ${shown}`, ...fresh.map((c) => `« ${c.quote || text.slice(0, 300)} »${c.ok ? '' : ` — à vérifier : ${c.why}`}`)],
    }).catch(() => {});
  } else if (outcome === 'declined' && p.status !== 'contact') {
    await sql(`update outreach_prospects set status = 'declined', declined_at = coalesce(declined_at, now()) where linkedin = $1 and status <> 'contact'`, [linkedin]);
  }
  return { ok: true, outcome, contacts: contacts.map((c) => ({ network: c.network, value: c.value, ok: c.ok, why: c.why })), added: fresh.length };
}

/** Messages seen but still without a decision after 2 hours: the night check e-mails Pierre about them (one mail a day). */
export async function reconcile() {
  const rows = await sql(
    `select m.linkedin, m.account, m.seen_at, p.name, p.school from prospect_messages m left join outreach_prospects p on p.linkedin = m.linkedin
      where m.analyzed_at is null and m.seen_at < now() - interval '2 hours' order by m.seen_at limit 50`);
  const [t] = await sql(`select count(*)::int as seen, count(*) filter (where analyzed_at is not null)::int as analyzed from prospect_messages`);
  return { pending: rows.length, rows, seen: Number(t?.seen ?? 0), analyzed: Number(t?.analyzed ?? 0) };
}

/** The register's numbers for /admin: every student message read gets a decision, and these must add up. */
export async function registerCounts() {
  const [m] = await sql(`
    select count(*)::int as seen,
      count(*) filter (where analyzed_at is not null)::int as analyzed,
      count(*) filter (where analyzed_at is null and seen_at < now() - interval '2 hours')::int as late,
      count(*) filter (where outcome = 'contact')::int as contact,
      count(*) filter (where outcome = 'verify')::int as verify,
      count(*) filter (where outcome = 'declined')::int as declined,
      count(*) filter (where outcome = 'none')::int as none,
      count(*) filter (where outcome = 'error')::int as error
    from prospect_messages`);
  const [c] = await sql(`select count(*)::int as total, count(*) filter (where status = 'new')::int as fresh, count(*) filter (where status = 'verify')::int as verify from prospect_contacts`);
  return { messages: m, contacts: c };
}

/** The contacts, newest first, with the prospect; `account` limits them to one account (the ambassador's own list). */
export async function contactList(accountId?: string, limit = 300) {
  return sql(
    `select c.id::text as id, c.linkedin, c.account, c.network, c.value, c.normalized, c.quote, c.status, c.source, c.created_at, c.updated_at,
            p.name, p.school, a.name as account_name
       from prospect_contacts c left join outreach_prospects p on p.linkedin = c.linkedin left join prospect_accounts a on a.id = c.account
      where ($1::text is null or c.account = $1)
      order by (c.status in ('new', 'verify')) desc, c.created_at desc limit $2`, [accountId ?? null, limit]);
}

/** Someone wrote to the student on that contact, or the contact is wrong, or a “to check” one is confirmed. */
export async function setContactStatus(id: string, status: 'contacted' | 'invalid' | 'new', account?: string) {
  if (!UUID_RE.test(id)) return false;
  const rows = await sql(
    `update prospect_contacts set status = $2, updated_at = now() where id = $1 and ($3::text is null or account = $3) returning linkedin`,
    [id, status, account ?? null]);
  if (rows[0] && status === 'contacted') await sql(`update outreach_prospects set contacted_at = coalesce(contacted_at, now()) where linkedin = $1`, [rows[0].linkedin]);
  return rows.length > 0;
}

/** What an ambassador sees of their own prospection: their account, their numbers, their contacts, who answered them. */
export async function ambassadorProspection(userId: string) {
  const id = ambAccountId(userId);
  const acc = await accountRow(id);
  const config = await getConfig();
  // A place in the pilot: an account still open keeps its place; a new (or stopped) one needs a free place.
  const [open] = await sql(`select count(*)::int as n from prospect_accounts where id like 'amb-%' and status in ('connecting', 'active', 'paused')`);
  const slots = (!!acc && ['connecting', 'active', 'paused'].includes(acc.status)) || Number(open?.n ?? 0) < (config.ambMaxAccounts ?? 10);
  if (!acc) return { account: null, enabled: config.ambEnabled === true, slots, contacts: [], replies: [], stats: null, limits: ambassadorLimits(null) };
  const c = await counts(id);
  const [s] = await sql(`select count(*) filter (where invited_at is not null)::int as invited, count(*) filter (where accepted_at is not null)::int as accepted from outreach_prospects where account = $1`, [id]);
  const contacts = await contactList(id, 100);
  // Students who wrote back lately: the ambassador answers them on LinkedIn (no automatic reply in their name).
  const replies = await sql(
    `select distinct on (m.linkedin) m.linkedin, m.analyzed_at, m.outcome, p.name, p.school from prospect_messages m join outreach_prospects p on p.linkedin = m.linkedin
      where m.account = $1 and m.analyzed_at > now() - interval '14 days' order by m.linkedin, m.analyzed_at desc`, [id]);
  return {
    account: acc, enabled: config.ambEnabled === true, slots, contacts, replies: replies.sort((a, b) => String(b.analyzed_at).localeCompare(String(a.analyzed_at))).slice(0, 30),
    stats: { invitesToday: c.invites_today, invitesWeek: c.invites_week, invited: Number(s?.invited ?? 0), accepted: Number(s?.accepted ?? 0) },
    limits: ambassadorLimits(acc.started_at),
  };
}

/**
 * The full page « Prospect with your LinkedIn » (26/11, Pierre) opens each time the ambassador opens their space while
 * their LinkedIn is not running: never connected, connection not finished, paused by LinkedIn, or stopped. Not when it
 * runs, while it is being erased, when ambassador prospection is off, or when the pilot has no free place.
 */
export async function linkedInGate(userId: string) {
  const p = await ambassadorProspection(userId);
  const status = p.account?.status ?? 'none';
  if (!p.enabled || !p.slots || status === 'active' || status === 'stop_requested') return null;
  return p;
}

export type { OutreachConfig };

/** Prospects that already have a contact in the register (their old single-contact line is not shown twice). */
export async function linkedinsWithContacts() {
  return new Set((await sql('select distinct linkedin from prospect_contacts')).map((r) => String(r.linkedin)));
}
