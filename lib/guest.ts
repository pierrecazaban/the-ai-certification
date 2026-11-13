import 'server-only';
import { randomBytes, randomUUID } from 'node:crypto';
import { sql } from './db';
import { findOrCreateUser, setFirstPassword } from './auth';
import { STUDENT_PROGRAM } from './catalog';
import { publicIntake, TERMS_VERSION } from './school';
import { siteUrl } from './site';

// Free access for invited people: one secret link (/invite/<code>) set in the admin console.
// Signing up there opens a student account with the course unlocked, like a paid registration at 0 €.
// Such registrations carry payment_id 'guest' so the admin figures keep them apart from sales.

export const GUEST_PAYMENT = 'guest';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_RE = /^[A-Za-z0-9_-]{10,40}$/;

const newCode = () => randomBytes(9).toString('base64url');

/** The current invite code, created on first use. */
export async function guestCode(): Promise<string> {
  await sql(`insert into guest_invite (id, code) values (1, $1) on conflict (id) do nothing`, [newCode()]);
  const [row] = await sql('select code from guest_invite where id = 1');
  return row.code as string;
}

/** A new link: the previous one stops working at once. */
export async function resetGuestCode() {
  await sql(`insert into guest_invite (id, code) values (1, $1) on conflict (id) do update set code = excluded.code`, [newCode()]);
}

export async function isGuestCode(code: string) {
  return CODE_RE.test(code) && code === (await guestCode());
}

export const guestUrl = (code: string) => `${siteUrl()}/invite/${code}`;

export type GuestResult = { result: 'ok' | 'exists' } | { result: 'invalid'; error: 'code' | 'fields' | 'password' | 'terms' };

/**
 * Sign-up from the invite page. A new person gets an account with their password and is signed in.
 * An address that already has an account gets the course too, but must sign in normally (the link cannot
 * be used to take over an existing account).
 */
export async function joinAsGuest(input: {
  code: string; first_name: string; last_name: string; email: string; password: string; terms: boolean; locale: 'fr' | 'en-us';
}): Promise<GuestResult> {
  if (!(await isGuestCode(input.code))) return { result: 'invalid', error: 'code' };
  const first = input.first_name.trim().slice(0, 80);
  const last = input.last_name.trim().slice(0, 80);
  const email = input.email.trim().toLowerCase();
  if (!first || !last || !EMAIL_RE.test(email)) return { result: 'invalid', error: 'fields' };
  if (input.password.length < 8) return { result: 'invalid', error: 'password' };
  if (!input.terms) return { result: 'invalid', error: 'terms' };

  const [existing] = await sql('select id from users where email = $1', [email]);
  const user = await findOrCreateUser({ email, first_name: first, last_name: last, locale: input.locale });
  await grantAccess(user.id, { first, last, email, locale: input.locale });
  if (existing) return { result: 'exists' };
  return (await setFirstPassword(user.id, input.password)) ? { result: 'ok' } : { result: 'exists' };
}

async function grantAccess(userId: string, p: { first: string; last: string; email: string; locale: string }) {
  const [has] = await sql(`select 1 from registrations where user_id = $1 and program = $2 and status = 'paid'`, [userId, STUDENT_PROGRAM]);
  if (has) return;
  const intake = await publicIntake();
  if (!intake) throw new Error('No intake available');
  await sql(
    `insert into registrations (
       id, reference, client_token, intake_id, university_id, first_name, last_name, email, phone,
       email_domain_mismatch, terms_accepted, age_confirmed, independence_acknowledged,
       marketing_opt_in, sms_opt_in, terms_version, currency, amount_cents, status, hold_expires_at,
       payment_id, paid_at, user_id, locale, program, organization
     ) values ($1,$2,$3,$4,null,$5,$6,$7,'',false,true,true,false,false,false,$8,'EUR',0,'paid',now(),$9,now(),$10,$11,$12,'')`,
    [
      randomUUID(), `GUEST-${randomBytes(4).toString('hex').toUpperCase()}`, randomBytes(24).toString('base64url'),
      intake.intake_id, p.first, p.last, p.email, TERMS_VERSION, GUEST_PAYMENT, userId, p.locale, STUDENT_PROGRAM,
    ],
  );
}
