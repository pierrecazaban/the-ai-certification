import 'server-only';
import { logAdmin } from './adminLog';
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { sql } from './db';
import { memberLog } from './saleLog';
import { DEFAULT_LOCALE, isLocale, type Locale } from './locales';
import { PRIVATE_SLUGS } from './private';

export type Role = 'student' | 'ambassador' | 'admin';
export type User = { id: string; email: string; role: Role; first_name: string; last_name: string; locale: Locale };

/** What the account menu shows (22/11): the email, or the username of an account created without one. */
export const NO_EMAIL = '@no-email.invalid';
export const shownId = (u: { email: string; first_name: string; last_name: string }) =>
  u.email.endsWith(NO_EMAIL) ? `${u.first_name} ${u.last_name}`.trim() : u.email;

export const SESSION_COOKIE = 'cfx_session';
// Holds no secret: only tells the public header to show the "My space" button.
export const MEMBER_COOKIE = 'cfx_member';
// As long as course access (6 months), so learners are not signed out mid-course.
const SESSION_DAYS = 400; // on reste connecté sur son appareil (22/11 : 183 → 400 jours, le maximum que gardent les navigateurs)

// User rows without the password hash, so it never travels further than this file.
const asUser = (row: Record<string, unknown> | undefined): User | null => {
  if (!row) return null;
  const { password_hash: _, ...user } = row;
  return user as User;
};

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

/** The one admin account: the first address of ADMIN_EMAILS (any others are ignored). */
function adminEmails() {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 1);
}

export async function findOrCreateUser(input: {
  email: string;
  role?: Role;
  first_name?: string;
  last_name?: string;
  locale?: string;
}): Promise<User> {
  const email = input.email.trim().toLowerCase();
  const [existing] = await sql('select * from users where email = $1', [email]);
  if (existing) return asUser(existing)!;
  const id = randomUUID();
  await sql(
    `insert into users (id, email, role, first_name, last_name, locale) values ($1, $2, $3, $4, $5, $6)
     on conflict (email) do nothing`,
    [id, email, input.role ?? 'student', input.first_name ?? '', input.last_name ?? '', isLocale(input.locale) ? input.locale : DEFAULT_LOCALE],
  );
  const [user] = await sql('select * from users where email = $1', [email]);
  return asUser(user)!;
}

/** Users who may sign in: paid students, ambassadors, and the configured admins. */
export async function userForLogin(email: string): Promise<User | null> {
  const clean = email.trim().toLowerCase();
  if (adminEmails().includes(clean)) {
    const user = await findOrCreateUser({ email: clean, role: 'admin' });
    if (user.role !== 'admin') await sql(`update users set role = 'admin' where id = $1`, [user.id]);
    return { ...user, role: 'admin' };
  }
  const [user] = await sql('select * from users where email = $1', [clean]);
  return asUser(user);
}

/** Creates a single-use sign-in token. Returns the raw token (only ever sent by email). */
export async function createLoginToken(userId: string, minutes: number) {
  const token = randomBytes(32).toString('base64url');
  await sql('insert into login_tokens (token_hash, user_id, expires_at) values ($1, $2, $3)', [
    hash(token),
    userId,
    new Date(Date.now() + minutes * 60 * 1000).toISOString(),
  ]);
  return token;
}

/** Consumes a sign-in token and opens a session. Returns the user, or null if the token is invalid. */
export async function consumeLoginToken(token: string): Promise<User | null> {
  const rows = await sql(
    `update login_tokens set used_at = now()
     where token_hash = $1 and used_at is null and expires_at > now()
     returning user_id`,
    [hash(token)],
  );
  if (!rows[0]) return null;
  const [user] = await sql('select * from users where id = $1', [rows[0].user_id]);
  if (!user) return null;
  return openSession(asUser(user)!);
}

const MIN_PASSWORD = 8;

/** `scrypt:<salt hex>:<hash hex>`, the format scripts/hash-password.mjs prints for ADMIN_PASSWORD_HASH. */
function hashPassword(password: string) {
  const salt = randomBytes(16);
  return `scrypt:${salt.toString('hex')}:${scryptSync(password, salt, 64).toString('hex')}`;
}

function checkPassword(password: string, stored: string | null | undefined) {
  const [scheme, salt, expected] = (stored ?? '').split(':');
  if (scheme !== 'scrypt' || !salt || !expected) return false;
  const actual = scryptSync(password, Buffer.from(salt, 'hex'), 64);
  const want = Buffer.from(expected, 'hex');
  return want.length === actual.length && timingSafeEqual(want, actual);
}

/** The sign-in name of an account without email: "first last", lower case, single spaces. */
export const usernameOf = (first: string, last: string) => `${first} ${last}`.trim().toLowerCase().replace(/\s+/g, ' ');

/** Placeholder email of an account created without one (the column is required): .invalid never receives mail. */
export const isPlaceholderEmail = (email: string) => email.endsWith('@no-email.invalid');

/**
 * Biz Dev account (20/11): only a name and a password, no email. Signs the person in at once.
 * Returns null when this name is already taken.
 */
export async function createNamedAccount(input: { first_name: string; last_name: string; password: string; role: Role }): Promise<User | null> {
  if (input.password.length < MIN_PASSWORD) return null;
  const id = randomUUID();
  const rows = await sql(
    `insert into users (id, email, role, first_name, last_name, locale, username, password_hash)
     values ($1, $2, $3, $4, $5, 'en-us', $6, $7) on conflict do nothing returning *`,
    [id, `${id}@no-email.invalid`, input.role, input.first_name.trim(), input.last_name.trim(), usernameOf(input.first_name, input.last_name), hashPassword(input.password)],
  );
  return rows[0] ? openSession(asUser(rows[0])!) : null;
}

export async function usernameTaken(first: string, last = '') {
  const [row] = await sql('select 1 from users where username = $1', [usernameOf(first, last)]);
  return Boolean(row);
}

/**
 * Email and password sign-in. An admin without a password of their own can use ADMIN_PASSWORD_HASH,
 * so the first admin can sign in before any email is sent.
 */
export async function passwordLogin(email: string, password: string): Promise<User | null> {
  const clean = email.trim().toLowerCase();
  // No "@": the name of an account created without email (Biz Dev).
  const user = clean.includes('@')
    ? await userForLogin(clean)
    : asUser((await sql('select * from users where username = $1', [clean.replace(/\s+/g, ' ')]))[0]);
  if (!user || !password) return null;
  const [row] = await sql('select password_hash from users where id = $1', [user.id]);
  const ok = row?.password_hash
    ? checkPassword(password, row.password_hash)
    : adminEmails().includes(clean) && checkPassword(password, process.env.ADMIN_PASSWORD_HASH);
  if (!ok && user.role === 'admin') await logAdmin('ÉCHEC de connexion au compte admin', 'mot de passe incorrect', user);
  return ok ? openSession(user) : null;
}

// Les deux serveurs Smart Mail (voir middleware.ts). Chacun sait répondre pour les deux ; on les interroge ensemble,
// pour qu'un serveur lent ou en redémarrage ne fasse pas retomber un ambassadeur sur le mot de passe.
const TOOL_SERVERS: [string, string][] = [
  ['ovh', process.env.TOOL_URL || 'https://158-69-232-131.sslip.io'],
  ['paris', process.env.TOOL_URL_PARIS ?? 'https://2-25-7-244.sslip.io'],
];

/** Does Smart Mail hold this address as a connected school mailbox? The server that holds it ('ovh', 'paris'), or null. */
async function smartMailServer(email: string): Promise<string | null> {
  const { setting } = await import('./settings');
  const key = await setting('RELANCES_API_KEY');
  if (!key) return null;
  const ask = async ([name, base]: [string, string]): Promise<string> => {
    const r = await fetch(`${base}/v1/site/connu?adresse=${encodeURIComponent(email)}`, {
      headers: { 'x-relances-key': key }, cache: 'no-store', signal: AbortSignal.timeout(5000),
    });
    const d = r.ok ? await r.json() : null;
    // Seule compte la réponse du serveur qui détient lui-même le compte (il sait s'il est encore ouvert) : ce qu'un serveur
    // rapporte de l'autre ne dit pas si le compte a été fermé (23/11).
    if (!d?.connu || String(d.serveur || name) !== name) throw new Error('unknown');
    return name;
  };
  // La première réponse « connu » gagne ; null seulement si aucun des deux ne connaît l'adresse (ou ne répond).
  return Promise.any(TOOL_SERVERS.map(ask)).catch(() => null);
}

/**
 * How this identifier signs in (22/11): the accounts decide, the person never chooses "student" or "ambassador".
 *  - 'school': the address is a school mailbox connected in Smart Mail (an ambassador, or the admin): sign-in goes through
 *    that mailbox, no password asked. Never for a student account: a student never goes through Smart Mail.
 *  - 'link': an account with no password yet: a sign-in link is sent to its email.
 *  - 'password': everything else (and unknown emails: nothing is revealed about them).
 */
export async function loginStep(identifier: string): Promise<{ step: 'school'; server: string } | { step: 'link' } | { step: 'password' }> {
  const clean = identifier.trim().toLowerCase();
  if (!clean.includes('@')) return { step: 'password' };
  const [row] = await sql('select role, password_hash from users where email = $1', [clean]);
  if (row?.role !== 'student') {
    const server = await smartMailServer(clean);
    if (server) return { step: 'school', server };
  }
  if (row && !row.password_hash && !adminEmails().includes(clean)) return { step: 'link' };
  return { step: 'password' };
}

/** Sets the password from a link sent by email (first sign-in or forgotten password), then signs the user in. */
export async function setPasswordWithToken(token: string, password: string): Promise<User | null> {
  if (password.length < MIN_PASSWORD) return null;
  const user = await consumeLoginToken(token);
  if (user) await sql('update users set password_hash = $2 where id = $1', [user.id, hashPassword(password)]);
  return user;
}

/** The first password, set right after paying (no email needed). Refused when the account already has one. */
export async function setFirstPassword(userId: string, password: string): Promise<User | null> {
  if (password.length < MIN_PASSWORD) return null;
  const rows = await sql('update users set password_hash = $2 where id = $1 and password_hash is null returning *', [userId, hashPassword(password)]);
  return rows[0] ? openSession(asUser(rows[0])!) : null;
}

/** Where a signed-in user lands. */
export function homePath(user: User, lang: Locale) {
  // The admin lands on the ambassador view too (19/11); the admin view stays one click away.
  if (user.role === 'admin' || user.role === 'ambassador') return `/${PRIVATE_SLUGS.ambassador}`;
  return `/space?lang=${isLocale(user.locale) ? user.locale : lang}`;
}

async function openSession(user: User): Promise<User> {
  const session = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);
  await sql('insert into sessions (token_hash, user_id, expires_at) values ($1, $2, $3)', [hash(session), user.id, expires.toISOString()]);
  await sql('update users set last_login_at = now() where id = $1', [user.id]);
  // Registre (28/11) : chaque connexion notée avec les numéros d'inscription payés du compte (ni nom ni e-mail).
  if (user.role !== 'admin') {
    try {
      const refs = await sql(`select reference from registrations where user_id = $1 and status = 'paid' order by paid_at desc limit 5`, [user.id]);
      memberLog('connexion', refs.map((r) => String(r.reference)), user.role);
    } catch {
      // never block a sign-in
    }
  }

  const jar = await cookies();
  const secure = process.env.NODE_ENV === 'production';
  jar.set(SESSION_COOKIE, session, { httpOnly: true, secure, sameSite: 'lax', path: '/', expires });
  jar.set(MEMBER_COOKIE, '1', { httpOnly: false, secure, sameSite: 'lax', path: '/', expires });
  if (user.role === 'admin') await logAdmin('Connexion au compte admin', `session ouverte pour ${SESSION_DAYS} jours`, user);
  return user;
}

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [user] = await sql(
    `select u.* from sessions s join users u on u.id = s.user_id
     where s.token_hash = $1 and s.expires_at > now()`,
    [hash(token)],
  );
  return asUser(user);
}

/**
 * Gate for private pages. Anyone without the right role gets the ordinary 404 page,
 * so the page cannot be told apart from an address that does not exist.
 */
export async function requireRole(...roles: Role[]): Promise<User> {
  const user = await currentUser();
  if (!user || !roles.includes(user.role)) notFound();
  return user;
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await sql('delete from sessions where token_hash = $1', [hash(token)]);
  jar.delete(SESSION_COOKIE);
  jar.delete(MEMBER_COOKIE);
}

/** Opens a session for this user (23/11): sign-in through Smart Mail (school email). */
export async function startSession(userId: string): Promise<User | null> {
  const [row] = await sql('select * from users where id = $1', [userId]);
  return row ? openSession(asUser(row)!) : null;
}

/** An ambassador account with a real email (23/11): school email (no password) or personal email (with one). */
export async function createAmbassadorAccount(email: string, password: string | null, firstName = ''): Promise<User | null> {
  const id = randomUUID();
  const rows = await sql(
    `insert into users (id, email, role, first_name, last_name, locale, password_hash) values ($1, $2, 'ambassador', $3, '', 'fr', $4)
     on conflict (email) do nothing returning *`,
    [id, email.trim().toLowerCase(), firstName, password ? hashPassword(password) : null],
  );
  return rows[0] ? asUser(rows[0]) : null;
}

