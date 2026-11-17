import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { sql } from './db';

// Settings the admin manages from /admin (API keys and the sender address), so the site runs without touching
// the code or the hosting. Stored encrypted in the database; a value set in the environment is the fallback.

export const SETTINGS = {
  STRIPE_SECRET_KEY: { label: 'Stripe secret key', help: 'Payments. Stripe → Developers → API keys: the sk_live_… secret key (sk_test_… to try without paying).', secret: true },
  STRIPE_WEBHOOK_SECRET: { label: 'Stripe webhook signing secret', help: 'Stripe → Developers → Webhooks → the endpoint ending in /api/stripe/webhook → Signing secret (whsec_…). Proves each payment notice really comes from Stripe.', secret: true },
  RESEND_API_KEY: { label: 'Resend API key', help: 'Sends the emails. Resend → API Keys (a “Sending access” key is enough).', secret: true },
  EMAIL_FROM: { label: 'Email sender', help: 'For example: The AI Certification <noreply@your-domain.com>. The domain must be verified in Resend.', secret: false },
  ANTHROPIC_API_KEY: { label: 'Claude API key (chatbot)', help: 'console.anthropic.com → API Keys. Empty = the chatbot is hidden.', secret: true },
  GOOGLE_CLIENT_ID: { label: 'Google OAuth client ID (calls)', help: 'Google Cloud → APIs & Services → Credentials → OAuth client ID (Web application). Used to create the Google Meet links of /call.', secret: false },
  GOOGLE_CLIENT_SECRET: { label: 'Google OAuth client secret (calls)', help: 'Same OAuth client → Client secret.', secret: true },
  GOOGLE_REFRESH_TOKEN: { label: 'Google Calendar connection (calls)', help: 'Set by the “Connect Google Calendar” button in /admin › Calls. Empty = not connected.', secret: true },
  CALLS_API_KEY: { label: 'Outreach script key (calls)', help: 'Shared with the LinkedIn script on your Mac: it registers prospects and sends the video link of each booked call on LinkedIn. Any long random string.', secret: true },
  RELANCES_API_KEY: { label: 'Reminders key (Smart Mail)', help: 'Shared with Smart Mail: it reads the unfinished registrations to send each student a short reminder from their school ambassador’s mailbox. Any long random string, the same as RELANCES_CLE on the Smart Mail server.', secret: true },
  MEET_LINK: { label: 'Fixed video link (calls, fallback)', help: 'Used for /call while Google Calendar is not connected, e.g. your personal meet.google.com/xxx-xxxx-xxx room. Empty = a Jitsi room per call.', secret: false },
} as const;

export type SettingKey = keyof typeof SETTINGS;
const KEYS = Object.keys(SETTINGS) as SettingKey[];

// Encryption key: SETTINGS_KEY in the hosting environment (set once), so a database dump alone reveals nothing.
const cryptoKey = () => createHash('sha256').update(process.env.SETTINGS_KEY ?? process.env.ADMIN_PASSWORD_HASH ?? 'theaicert-local').digest();

function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', cryptoKey(), iv);
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

function decrypt(stored: string): string | null {
  try {
    const [iv, tag, data] = stored.split('.').map((s) => Buffer.from(s, 'base64'));
    const decipher = createDecipheriv('aes-256-gcm', cryptoKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

// Read on most requests, so kept in memory for a short while (a save clears it at once on this server).
let cache: { at: number; values: Partial<Record<SettingKey, string>> } | null = null;
const TTL_MS = 30_000;

async function stored(): Promise<Partial<Record<SettingKey, string>>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.values;
  const rows = await sql('select key, value from settings');
  const values: Partial<Record<SettingKey, string>> = {};
  for (const r of rows) {
    if (!KEYS.includes(r.key)) continue;
    const v = decrypt(String(r.value));
    if (v) values[r.key as SettingKey] = v;
  }
  cache = { at: Date.now(), values };
  return values;
}

// Keys can no longer be changed from the admin (15/11, decision of the owner): every key is read from the hosting
// (Vercel environment variables) only. The one exception is the Google Calendar connection, written by Google's
// own sign-in flow (lib/calls.ts), never pasted.
const FROM_ADMIN_FLOW: SettingKey[] = ['GOOGLE_REFRESH_TOKEN'];

/** The environment variable of that name (set in Vercel); only the Google Calendar connection may come from the database. */
export async function setting(key: SettingKey): Promise<string | undefined> {
  const env = process.env[key]?.trim() || undefined;
  if (!FROM_ADMIN_FLOW.includes(key)) return env;
  return (await stored())[key] || env;
}

export async function saveSetting(key: SettingKey, value: string) {
  if (!FROM_ADMIN_FLOW.includes(key)) throw new Error(`Setting ${key} can only be changed in the hosting (Vercel).`);
  const clean = value.trim();
  if (clean) {
    await sql(
      `insert into settings (key, value, updated_at) values ($1, $2, now())
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [key, encrypt(clean)],
    );
  } else {
    await sql('delete from settings where key = $1', [key]);
  }
  cache = null;
}

/** For the admin screen: where each value comes from, shown masked. */
export async function settingsOverview() {
  const values = await stored();
  return KEYS.map((key) => {
    const fromDb = FROM_ADMIN_FLOW.includes(key) ? values[key] : undefined;
    const value = fromDb || process.env[key]?.trim() || '';
    const masked = !value ? '' : SETTINGS[key].secret ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
    return { key, ...SETTINGS[key], masked, source: fromDb ? 'admin' : value ? 'host' : null };
  });
}
