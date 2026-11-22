import 'server-only';
import { randomBytes, randomUUID } from 'node:crypto';
import { sql } from './db';
import { createAmbassadorAccount, createNamedAccount, startSession, usernameTaken, type User } from './auth';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createTicket } from './tickets';

// Commission rates in basis points (1000 = 10 %), applied to the amount the student paid.
export const RATES = {
  owner: Number(process.env.TEAM_RATE_OWNER_BP ?? 1000), // ambassador who holds the student's school
  parent: Number(process.env.TEAM_RATE_PARENT_BP ?? 1000), // the ambassador who invited them
  grandparent: Number(process.env.TEAM_RATE_GRANDPARENT_BP ?? 500), // the one above: nothing further up
};
export const AMBASSADOR_TERMS_VERSION = '2026-10-25';


// Code personnel pour le tool Smart Mail (18/11, en chiffres le 19/11) : 8 chiffres, jamais confondu avec le code du
// jour (6 chiffres). Ne commence pas par 0.
const TOOL_CODE_RE = /^[1-9]\d{7}$/;
function newToolCode() {
  const b = randomBytes(8);
  return String(1 + (b[0] % 9)) + Array.from(b.subarray(1), (x) => String(x % 10)).join('');
}

/** Le code personnel d'un ambassadeur, créé au premier besoin. */
export async function toolCodeOf(userId: string): Promise<string> {
  await ensureAmbassador(userId);
  const [row] = await sql('select tool_code from ambassadors where user_id = $1', [userId]);
  if (row?.tool_code && TOOL_CODE_RE.test(String(row.tool_code))) return String(row.tool_code);
  // Ancien code à lettres (avant le 19/11, jamais utilisé) : remplacé par un code en chiffres.
  if (row?.tool_code) await sql('update ambassadors set tool_code = null where user_id = $1', [userId]);
  for (let i = 0; i < 5; i++) {
    const [set] = await sql(
      `update ambassadors set tool_code = $2 where user_id = $1 and tool_code is null
       and not exists (select 1 from ambassadors where tool_code = $2) returning tool_code`,
      [userId, newToolCode()],
    );
    if (set?.tool_code) return String(set.tool_code);
    const [again] = await sql('select tool_code from ambassadors where user_id = $1', [userId]);
    if (again?.tool_code) return String(again.tool_code);
  }
  throw new Error('tool code');
}

/** L'ambassadeur à qui appartient un code personnel (ou null). */
export async function ambassadorByToolCode(code: string) {
  const c = String(code ?? '').replace(/\s+/g, '');
  if (!TOOL_CODE_RE.test(c)) return null;
  const [row] = await sql(
    `select a.user_id, u.first_name, u.last_name, u.role from ambassadors a join users u on u.id = a.user_id where a.tool_code = $1`,
    [c],
  );
  return row ?? null;
}

function newInviteCode() {
  // 10 lowercase letters/digits: used as the whole invite address, e.g. /k7q2m9xa4t.
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(randomBytes(10), (b) => alphabet[b % alphabet.length]).join('');
}

/** Ambassador row for a user, created on first use (admins get one too, to invite the first ambassadors). */
export async function ensureAmbassador(userId: string, parentUserId: string | null = null) {
  const [row] = await sql('select * from ambassadors where user_id = $1', [userId]);
  if (row) return row;
  for (let i = 0; i < 5; i++) {
    const created = await sql(
      `insert into ambassadors (user_id, invite_code, parent_user_id, terms_version) values ($1, $2, $3, $4)
       on conflict do nothing returning *`,
      [userId, newInviteCode(), parentUserId, AMBASSADOR_TERMS_VERSION],
    );
    if (created[0]) return created[0];
    const [again] = await sql('select * from ambassadors where user_id = $1', [userId]);
    if (again) return again;
  }
  throw new Error('could not create invite code');
}

export async function inviterByCode(code: string) {
  if (!/^[a-z0-9]{10}$/.test(code)) return null;
  const [row] = await sql(
    `select a.user_id, u.first_name, u.role from ambassadors a join users u on u.id = a.user_id where a.invite_code = $1`,
    [code],
  );
  return row ?? null;
}

export async function freeSchools() {
  const rows = await sql(
    `select u.id, u.name, u.state from universities u
     where u.active and not exists (select 1 from school_claims c where c.university_id = u.id)`,
  );
  // Alphabetical as people expect it: « École » with the E's, not after Z.
  return rows.sort((a, b) => String(a.name).localeCompare(String(b.name), 'fr', { sensitivity: 'base', numeric: true }));
}

export type JoinResult = { ok: true } | { ok: false; error: 'invalid' | 'taken' | 'exists' | 'terms' | 'school' | 'password' };

/**
 * The school picked in a form: a listed one, one the ambassador typed because it is missing (created, or found
 * if a school of that name already exists, so it also appears for students), or none at all.
 */
export async function pickedSchool(universityId: string, newName = '', newCity = ''): Promise<{ id: string } | { none: true } | null> {
  if (universityId === 'none') return { none: true };
  if (universityId === 'new') {
    const name = newName.trim().replace(/\s+/g, ' ').slice(0, 160);
    if (name.length < 3) return null;
    // Same school whatever the capitals, accents or punctuation ("ieseg", "IÉSEG", "Kedge business school"):
    // a second entry for a school already listed would show it twice.
    const plain = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const wanted = plain(name);
    const all = await sql('select id::text as id, name, short_name from universities');
    const found = all.find((u) => plain(String(u.name)) === wanted || (u.short_name && plain(String(u.short_name)) === wanted));
    if (found) return { id: String(found.id) };
    const id = randomUUID();
    await sql(`insert into universities (id, name, short_name, state, email_domains, active) values ($1, $2, '', $3, '{}', true)`, [id, name, newCity.trim().slice(0, 80)]);
    return { id };
  }
  const [row] = await sql('select id from universities where id::text = $1 and active', [universityId]);
  return row ? { id: String(row.id) } : null;
}

/** Self-service sign-up from an invite link: creates the ambassador, gives them the school, emails a sign-in link. */
/**
 * Biz Dev sign-up through an invite link (20/11): only a name and a password, no email and no school.
 * The account is open at once (signed in); a school can be taken later from the ambassador space.
 */
export async function joinTeam(input: {
  code: string;
  username: string;
  password: string;
  terms: boolean;
}): Promise<JoinResult> {
  // Un nom d'utilisateur au lieu du prénom et du nom (22/11) : c'est aussi ce qui sert à se connecter.
  const inviter = await inviterByCode(input.code);
  const first = input.username.trim().replace(/\s+/g, ' ').slice(0, 60);
  const last = '';
  if (!inviter || first.length < 2 || first.includes('@')) return { ok: false, error: 'invalid' };
  if (input.password.length < 8) return { ok: false, error: 'password' };
  if (!input.terms) return { ok: false, error: 'terms' };
  if (await usernameTaken(first, last)) return { ok: false, error: 'exists' };

  const user = await createNamedAccount({ first_name: first, last_name: last, password: input.password, role: 'ambassador' });
  if (!user) return { ok: false, error: 'exists' };  // same name taken in the meantime
  // Invited by an admin = first level, with no one above.
  await ensureAmbassador(user.id, inviter.role === 'admin' ? null : inviter.user_id);
  return { ok: true };
}

/** Ambassadors who see their earnings and can ask for a payout in their space (22/11): only these addresses. */
const EARNINGS_EMAILS = ['jbejani9008@sdsu.edu'];
export const showsEarnings = (email: string | null | undefined) => EARNINGS_EMAILS.includes(String(email ?? '').trim().toLowerCase());

/** Takes the school whose email domain matches this address (sub-domains included), if nobody holds it yet. */
async function claimSchoolOfEmail(userId: string, email: string) {
  const domain = email.split('@')[1]?.trim().toLowerCase() ?? '';
  if (!domain) return false;
  const [school] = await sql(
    `select id from universities where active
       and exists (select 1 from unnest(email_domains) d where $1 = lower(d) or $1 like '%.' || lower(d)) limit 1`,
    [domain],
  );
  return school ? claimSchool(userId, String(school.id)) : false;
}

export async function claimSchool(userId: string, universityId: string) {
  const claimed = await sql(
    `insert into school_claims (university_id, user_id)
     select $1, $2 where exists (select 1 from universities where id = $1 and active)
     on conflict do nothing returning university_id`,
    [universityId, userId],
  );
  return Boolean(claimed[0]);
}

/** Schools an ambassador holds. One is taken freely; any further one is asked for (requestSchool). */
export async function schoolCount(userId: string) {
  const [r] = await sql('select count(*)::int as n from school_claims where user_id = $1', [userId]);
  return Number(r.n);
}

/** A request for one more school: stored, and a ticket so it is seen in /admin. */
export async function requestSchool(userId: string, input: { universityId: string; newName: string; newCity: string }) {
  const listed = input.universityId && input.universityId !== 'new';
  const name = input.newName.trim().replace(/\s+/g, ' ').slice(0, 160);
  if (!listed && name.length < 3) return 'pick';
  const [school] = listed ? await sql('select id, name from universities where id::text = $1 and active', [input.universityId]) : [];
  if (listed && !school) return 'pick';
  if (school) {
    const [taken] = await sql('select 1 from school_claims where university_id = $1', [school.id]);
    if (taken) return 'taken';
  }
  const [open] = await sql(`select 1 from school_requests where user_id = $1 and status = 'pending'`, [userId]);
  if (open) return 'pending';
  await sql(
    `insert into school_requests (id, user_id, university_id, new_name, new_city) values ($1, $2, $3, $4, $5)`,
    [randomUUID(), userId, school?.id ?? null, school ? '' : name, school ? '' : input.newCity.trim().slice(0, 80)],
  );
  const [u] = await sql('select first_name, last_name, email from users where id = $1', [userId]);
  await createTicket({
    name: `${u.first_name} ${u.last_name}`.trim() || u.email,
    email: u.email,
    category: 'school',
    message: `Asks for one more school: ${school ? school.name : `${name} (to add${input.newCity.trim() ? `, ${input.newCity.trim()}` : ''})`}.\nAccept or refuse it in /admin → Ambassadors.`,
    locale: 'en-us',
    notify: false,
  });
  return 'requested';
}

/** Admin decision on a school request: accepted = the school is given (created first if it was typed). */
export async function decideSchoolRequest(requestId: string, accept: boolean) {
  const [r] = await sql(`select * from school_requests where id::text = $1 and status = 'pending'`, [requestId]);
  if (!r) return 'gone';
  if (!accept) {
    await sql(`update school_requests set status = 'refused', decided_at = now() where id = $1`, [r.id]);
    return 'refused';
  }
  const school = r.university_id ? { id: String(r.university_id) } : await pickedSchool('new', r.new_name, r.new_city);
  if (!school || !('id' in school) || !(await claimSchool(String(r.user_id), school.id))) return 'taken';
  await sql(`update school_requests set status = 'accepted', decided_at = now(), university_id = $2 where id = $1`, [r.id, school.id]);
  return 'accepted';
}

/**
 * Called once a registration is paid: the ambassador holding the student's school earns the owner rate,
 * the one who invited them the parent rate, and the one above that the grandparent rate; nobody further up
 * (and never the admin, whose invites start a branch with no one above). Idempotent per ambassador and registration.
 */
export async function recordCommissions(registrationId: string) {
  const [r] = await sql(
    `select r.id, r.amount_cents, r.currency, c.user_id as owner_id, a.parent_user_id, p.parent_user_id as grandparent_user_id
     from registrations r
     join school_claims c on c.university_id = r.university_id
     join ambassadors a on a.user_id = c.user_id
     left join ambassadors p on p.user_id = a.parent_user_id
     where r.id = $1 and r.status = 'paid'`,
    [registrationId],
  );
  if (!r) return;
  const lines: { user: string; level: number; rate: number }[] = [{ user: r.owner_id, level: 1, rate: RATES.owner }];
  if (r.parent_user_id) lines.push({ user: r.parent_user_id, level: 2, rate: RATES.parent });
  if (r.grandparent_user_id) lines.push({ user: r.grandparent_user_id, level: 3, rate: RATES.grandparent });
  // Admins see the whole network but never earn commissions.
  const admins = new Set((await sql(`select id from users where role = 'admin' and id = any($1)`, [lines.map((l) => l.user)])).map((u) => String(u.id)));
  for (const l of lines.filter((l) => !admins.has(String(l.user)))) {
    await sql(
      `insert into commissions (id, user_id, registration_id, level, rate_bp, amount_cents, currency)
       values ($1, $2, $3, $4, $5, $6, $7) on conflict (user_id, registration_id) do nothing`,
      [randomUUID(), l.user, r.id, l.level, l.rate, Math.round((r.amount_cents * l.rate) / 10000), r.currency],
    );
  }
}

export async function saveBankDetails(userId: string, holder: string, iban: string) {
  const clean = iban.replace(/\s+/g, '').toUpperCase();
  if (!holder.trim() || !/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(clean)) return false;
  await sql('update ambassadors set iban = $2, iban_holder = $3 where user_id = $1', [userId, clean, holder.trim()]);
  return true;
}

/**
 * What an ambassador can withdraw, per currency (22/11): everything earned (cancelled commissions aside)
 * minus the payouts already asked for or paid. Payouts may be any amount up to that balance.
 */
export async function payoutBalances(userId: string) {
  const rows = await sql(
    `select c.currency,
       coalesce((select sum(amount_cents) from commissions where user_id = $1 and currency = c.currency and status <> 'cancelled'), 0)::int as earned,
       coalesce((select sum(amount_cents) from payouts where user_id = $1 and currency = c.currency and status = 'requested'), 0)::int as requested,
       coalesce((select sum(amount_cents) from payouts where user_id = $1 and currency = c.currency and status = 'paid'), 0)::int as paid
     from (select currency from commissions where user_id = $1 union select currency from payouts where user_id = $1) c
     order by c.currency`,
    [userId],
  );
  return rows.map((r) => ({
    currency: String(r.currency),
    earned: Number(r.earned),
    requested: Number(r.requested),
    paid: Number(r.paid),
    available: Math.max(0, Number(r.earned) - Number(r.requested) - Number(r.paid)),
  }));
}

/** A payout of the amount the ambassador chose, up to what is available in that currency; a ticket in /admin. */
export async function requestPayout(userId: string, currency: string, amountCents: number) {
  const [amb] = await sql('select iban, iban_holder from ambassadors where user_id = $1', [userId]);
  if (!amb?.iban) return 'no_iban';
  const balance = (await payoutBalances(userId)).find((b) => b.currency === currency);
  if (!balance || balance.available <= 0) return 'nothing';
  if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > balance.available) return 'amount';
  // One statement checks the balance again and records the payout: two quick clicks cannot exceed it.
  const id = randomUUID();
  const [made] = await sql(
    `insert into payouts (id, user_id, currency, amount_cents, iban, iban_holder)
     select $1::uuid, $2::uuid, $3::text, $4::int, $5::text, $6::text
     where $4::int <= coalesce((select sum(amount_cents) from commissions where user_id = $2 and currency = $3 and status <> 'cancelled'), 0)
                - coalesce((select sum(amount_cents) from payouts where user_id = $2 and currency = $3 and status in ('requested', 'paid')), 0)
     returning id`,
    [id, userId, currency, amountCents, amb.iban, amb.iban_holder],
  );
  if (!made) return 'amount';
  const fmt = (c: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(c / 100);
  // A ticket in /admin so the transfer is not forgotten: it is promised within 48 hours.
  const [u] = await sql('select first_name, last_name, email from users where id = $1', [userId]);
  await createTicket({
    name: `${u.first_name} ${u.last_name}`.trim() || u.email,
    email: u.email,
    category: 'payout',
    message: [
      `Ambassador payout request: ${fmt(amountCents)} (balance before this request: ${fmt(balance.available)}).`,
      `Account holder: ${amb.iban_holder}`,
      `IBAN : ${amb.iban}`,
      'Transfer within 48 hours, then click “Transfer done” on this ticket.',
    ].join('\n'),
    locale: 'en-us',
    notify: false,
  });
  return 'ok';
}

export async function markPayoutPaid(payoutId: string) {
  await sql(`update payouts set status = 'paid', paid_at = now() where id = $1 and status = 'requested'`, [payoutId]);
  await sql(`update commissions set status = 'paid' where payout_id = $1`, [payoutId]);
}

export async function releaseSchool(universityId: string) {
  await sql('delete from school_claims where university_id = $1', [universityId]);
}

export type Ambassador = User;

/** A Master names someone of their branch Master (19/11); the admin (Pierre et Hippolyte) may name anyone. */
export async function nameMaster(by: User, targetId: string): Promise<'master' | 'master_refused'> {
  if (!/^[0-9a-f-]{36}$/i.test(targetId) || targetId === by.id) return 'master_refused';
  if (by.role !== 'admin') {
    const [me] = await sql('select master_by is not null as master from ambassadors where user_id = $1', [by.id]);
    if (!me?.master) return 'master_refused';
    const [below] = await sql(
      `with recursive down as (
         select user_id from ambassadors where parent_user_id = $1
         union select a.user_id from ambassadors a join down d on a.parent_user_id = d.user_id)
       select 1 from down where user_id = $2 limit 1`,
      [by.id, targetId],
    );
    if (!below) return 'master_refused';
  }
  const rows = await sql('update ambassadors set master_by = $2, master_at = now() where user_id = $1 and master_by is null returning user_id', [targetId, by.id]);
  return rows.length ? 'master' : 'master_refused';
}

// Suppression d'un ambassadeur court terme (19/11) : effacé du site tout de suite, et son compte Smart Mail effacé par
// le serveur Smart Mail (route protégée par la clé partagée des relances), retenté à chaque synchro si besoin.
const SMARTMAIL_API = (process.env.SMARTMAIL_SCHOOLS_URL ?? 'https://158-69-232-131.sslip.io/v1/porte/ecoles').replace(/\/v1\/.*$/, '');

async function deleteOnSmartMail(id: number): Promise<boolean> {
  const { setting } = await import('./settings');
  const key = await setting('RELANCES_API_KEY');
  if (!key) return false;
  try {
    const res = await fetch(`${SMARTMAIL_API}/v1/site/ambassadeurs/${id}/supprimer`, {
      method: 'POST', headers: { 'x-relances-key': key }, cache: 'no-store', signal: AbortSignal.timeout(15000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function deleteShortAmbassador(id: number): Promise<'short_deleted' | 'short_pending'> {
  await sql('insert into short_removed (smartmail_id) values ($1) on conflict (smartmail_id) do update set done = false', [id]);
  await sql('delete from short_ambassadors where smartmail_id = $1', [id]);
  await sql('delete from mail_received where smartmail_id = $1', [id]);
  const ok = await deleteOnSmartMail(id);
  if (ok) await sql('update short_removed set done = true where smartmail_id = $1', [id]);
  return ok ? 'short_deleted' : 'short_pending';
}

/** Retries the Smart Mail deletions that did not go through yet (called by the Smart Mail sync). */
export async function retryShortDeletions() {
  const rows = await sql('select smartmail_id from short_removed where not done');
  for (const r of rows) if (await deleteOnSmartMail(Number(r.smartmail_id))) await sql('update short_removed set done = true where smartmail_id = $1', [r.smartmail_id]);
}

/** The admin takes the Legend grade back (22/11). */
export async function removeLegend(by: User, targetId: string): Promise<'unlegend' | 'master_refused'> {
  if (by.role !== 'admin' || !/^[0-9a-f-]{36}$/i.test(targetId)) return 'master_refused';
  const rows = await sql('update ambassadors set master_by = null, master_at = null where user_id = $1 and master_by is not null returning user_id', [targetId]);
  return rows.length ? 'unlegend' : 'master_refused';
}

/**
 * The admin deletes a long-term ambassador (22/11): those they invited move up under their own inviter, their schools
 * become free, their commissions, payouts and requests go. Their account is deleted too, unless it is also a student's
 * (a purchase, a course in progress, a certificate): then it simply becomes a student account again.
 */
export async function deleteAmbassador(by: User, targetId: string): Promise<'amb_deleted' | 'amb_refused'> {
  if (by.role !== 'admin' || !/^[0-9a-f-]{36}$/i.test(targetId) || targetId === by.id) return 'amb_refused';
  const [a] = await sql(`select a.parent_user_id, u.role from ambassadors a join users u on u.id = a.user_id where a.user_id = $1`, [targetId]);
  if (!a || a.role === 'admin') return 'amb_refused';
  await sql('update ambassadors set parent_user_id = $2 where parent_user_id = $1', [targetId, a.parent_user_id ?? null]);
  await sql('update ambassadors set master_by = null where master_by = $1', [targetId]);
  for (const t of ['school_claims', 'school_requests', 'commissions', 'payouts']) await sql(`delete from ${t} where user_id = $1`, [targetId]);
  await sql('delete from ambassadors where user_id = $1', [targetId]);
  await sql('delete from sessions where user_id = $1', [targetId]);
  await sql('delete from login_tokens where user_id = $1', [targetId]);
  const [student] = await sql(
    `select (exists (select 1 from registrations where user_id = $1 and status in ('paid', 'refunded'))
          or exists (select 1 from lesson_progress where user_id = $1)
          or exists (select 1 from certificates where user_id = $1)) as yes`, [targetId]);
  if (student?.yes) await sql(`update users set role = 'student' where id = $1`, [targetId]);
  else {
    for (const t of ['exercise_submissions', 'quiz_attempts', 'exam_attempts']) await sql(`delete from ${t} where user_id = $1`, [targetId]);
    await sql('update registrations set user_id = null where user_id = $1', [targetId]);
    await sql('delete from users where id = $1', [targetId]);
  }
  return 'amb_deleted';
}

/** Renames someone of one's pyramid, for oneself only (22/11). An empty name puts their own name back. */
export async function renameForMe(by: User, targetId: string, alias: string): Promise<'renamed' | 'amb_refused'> {
  if (!/^[0-9a-f-]{36}$/i.test(targetId) || targetId === by.id) return 'amb_refused';
  if (by.role !== 'admin') {
    const [below] = await sql(
      `with recursive down as (
         select user_id from ambassadors where parent_user_id = $1
         union select a.user_id from ambassadors a join down d on a.parent_user_id = d.user_id)
       select 1 from down where user_id = $2 limit 1`,
      [by.id, targetId],
    );
    if (!below) return 'amb_refused';
  }
  const clean = alias.trim().replace(/\s+/g, ' ').slice(0, 60);
  if (!clean) await sql('delete from ambassador_aliases where owner_id = $1 and target_id = $2', [by.id, targetId]);
  else await sql(
    `insert into ambassador_aliases (owner_id, target_id, alias) values ($1, $2, $3)
     on conflict (owner_id, target_id) do update set alias = excluded.alias`, [by.id, targetId, clean]);
  return 'renamed';
}

// ---------------------------------------------------------------- passerelle avec Smart Mail (23/11)
// Signée avec la clé partagée des relances (RELANCES_API_KEY), comme le reste des échanges site ↔ Smart Mail.
async function relancesKey() {
  const { setting } = await import('./settings');
  return (await setting('RELANCES_API_KEY')) || '';
}
const b64 = (s: string) => Buffer.from(s).toString('base64url');

/** A pass for /tool: opens the gate without the code of the day, and records who invited (their tool code). */
export async function toolPass(input: { parrain?: string; espace?: boolean }) {
  const key = await relancesKey();
  if (!key) return null;
  const body = b64(JSON.stringify({ parrain: input.parrain ?? '', espace: Boolean(input.espace), exp: Date.now() / 1000 + 600 }));
  return `${body}.${createHmac('sha256', key).update(body).digest('hex')}`;
}

/** Reads the token Smart Mail signs for an ambassador who programmed their mails; null if not valid. */
async function readSmartMailToken(t: string): Promise<{ uid: number; email: string; parrain: string } | null> {
  const key = await relancesKey();
  const [body, sig] = String(t || '').split('.');
  if (!key || !body || !sig) return null;
  const want = createHmac('sha256', key).update(body).digest('hex');
  if (sig.length !== want.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  try {
    const d = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!(Number(d.exp) > Date.now() / 1000) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(d.email))) return null;
    return { uid: Math.trunc(Number(d.uid)), email: String(d.email).toLowerCase(), parrain: String(d.parrain || '').toUpperCase() };
  } catch {
    return null;
  }
}

async function parentFromToolCode(code: string): Promise<string | null> {
  if (!code) return null;
  const [row] = await sql(`select a.user_id, u.role from ambassadors a join users u on u.id = a.user_id where a.tool_code = $1`, [code]);
  return row && row.role !== 'admin' ? String(row.user_id) : null;
}

/** Signs in (and on the first time, creates) the school ambassador Smart Mail vouches for; false if the token is bad. */
export async function signInFromSmartMail(t: string): Promise<'ambassador' | 'student' | false> {
  const d = await readSmartMailToken(t);
  if (!d) return false;
  const [found] = await sql('select id, role from users where email = $1', [d.email]);
  // Un étudiant de la certification reste un étudiant (22/11) : passé par Smart Mail par erreur (le bouton « mon école »
  // de la page de connexion), il retrouve son espace de cours, son compte n'est jamais changé en compte ambassadeur.
  if (found?.role === 'student') return (await startSession(String(found.id))) ? 'student' : false;
  let id = found ? String(found.id) : '';
  if (!found) {
    const local = d.email.split('@')[0].split(/[._-]/)[0];
    const u = await createAmbassadorAccount(d.email, null, local ? local.charAt(0).toUpperCase() + local.slice(1) : '');
    if (!u) return false;
    id = u.id;
  }
  await ensureAmbassador(id, await parentFromToolCode(d.parrain));
  // Revenus visibles (22/11) : l'ambassadeur prend l'école de son adresse si elle est libre, pour toucher ses commissions.
  if (showsEarnings(d.email)) await claimSchoolOfEmail(id, d.email);
  if (d.uid > 0) await sql('update ambassadors set smartmail_id = $2 where user_id = $1 and smartmail_id is null', [id, d.uid]);
  return (await startSession(id)) ? 'ambassador' : false;
}

/** Sign-up with a personal email (23/11): straight to the ambassador space, nothing to program. */
export async function joinWithEmail(input: { code: string; email: string; password: string; terms: boolean }): Promise<JoinResult> {
  const inviter = await inviterByCode(input.code);
  const email = input.email.trim().toLowerCase();
  if (!inviter || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'invalid' };
  if (input.password.length < 8) return { ok: false, error: 'password' };
  if (!input.terms) return { ok: false, error: 'terms' };
  const local = email.split('@')[0].split(/[._-]/)[0];
  const user = await createAmbassadorAccount(email, input.password, local ? local.charAt(0).toUpperCase() + local.slice(1) : '');
  if (!user) return { ok: false, error: 'exists' };
  await ensureAmbassador(user.id, inviter.role === 'admin' ? null : inviter.user_id);
  await startSession(user.id);
  return { ok: true };
}

/** The pass for an invite link's “school email” choice: the inviter's tool code goes with it. */
export async function inviteToolPass(code: string) {
  const inviter = await inviterByCode(code);
  if (!inviter) return null;
  return toolPass({ parrain: inviter.role === 'admin' ? '' : await toolCodeOf(String(inviter.user_id)) });
}

