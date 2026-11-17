import 'server-only';
import { logAdmin } from './adminLog';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { sql } from './db';
import { saveSetting, setting } from './settings';
import { siteUrl } from './site';

// Ambassador calls: the admin says when they are free (in plain words, read by Claude), candidates pick a
// 45-minute slot on /call, and each booking gets a video link (Google Meet when Google Calendar is connected).

export const CALL_MINUTES = 45;
const STEP_MINUTES = 60; // a call every hour inside a window: 45 minutes + 15 to breathe
const LEAD_MINUTES = 180; // no booking less than 3 hours ahead
const HORIZON_DAYS = 21;
export const TZ = 'Europe/Paris';
// Until the admin says otherwise: free every day from 11:00 to 19:00 (Paris).
const DEFAULT_DAY = { start: '11:00', end: '19:00' };
// Share of slots shown as already taken, so the calendar never looks empty (the same slots stay hidden on every visit).
const BUSY_SHARE = 0.3;

export type Window = { id: string; starts_at: Date; ends_at: Date };
export type Booking = {
  id: string; reference: string; token: string; starts_at: Date; ends_at: Date; first_name: string; last_name: string;
  email: string; school: string; linkedin: string; meet_url: string; calendar_event_id: string | null; status: string; created_at: Date;
};

// ---------- Paris time ----------

/** Minutes Paris is ahead of UTC at a given instant (60 in winter, 120 in summer). */
function parisOffset(at: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  return Math.round((asUtc - Math.floor(at.getTime() / 60000) * 60000) / 60000);
}

/** “2026-11-18” + “14:30”, Paris time → the instant. */
export function parisTime(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const first = guess - parisOffset(new Date(guess)) * 60000;
  return new Date(guess - parisOffset(new Date(first)) * 60000); // second pass settles the days the clocks change
}

/** The instant → { date: '2026-11-18', time: '14:30' } in Paris. */
export function parisParts(at: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

export const frDay = (at: Date) => new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(at);
export const frTime = (at: Date) => new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(at);

// ---------- Availability ----------

export async function windows(): Promise<Window[]> {
  const rows = await sql(`select id, starts_at, ends_at from call_windows where ends_at > now() order by starts_at`);
  if (!rows.length) return defaultWindows();
  return rows.map((r) => ({ id: r.id, starts_at: new Date(r.starts_at), ends_at: new Date(r.ends_at) }));
}

/** The standing rule (every day 11:00-19:00) over the coming weeks, used while no window is saved. */
function defaultWindows(): Window[] {
  const out: Window[] = [];
  for (let i = 0; i <= HORIZON_DAYS; i++) {
    const { date } = parisParts(new Date(Date.now() + i * 86400000));
    out.push({ id: `default-${date}`, starts_at: parisTime(date, DEFAULT_DAY.start), ends_at: parisTime(date, DEFAULT_DAY.end) });
  }
  return out.filter((w) => w.ends_at.getTime() > Date.now());
}

/** Saves the standing rule as real windows, so Claude and the admin can then change single days. */
async function materialiseDefault() {
  const [{ n }] = await sql('select count(*)::int as n from call_windows where ends_at > now()');
  if (n > 0) return;
  for (const w of defaultWindows()) {
    await sql('insert into call_windows (id, starts_at, ends_at) values ($1, $2, $3)', [randomUUID(), w.starts_at.toISOString(), w.ends_at.toISOString()]);
  }
}

/** A few slots look taken: decided from the slot time alone, so a visitor sees the same calendar on every visit. */
const looksBusy = (t: number) => createHash('sha256').update(`busy:${t}`).digest()[0] < 256 * BUSY_SHARE;

export async function deleteWindow(id: string) {
  if (id.startsWith('default-')) {
    await materialiseDefault();
    const day = id.slice('default-'.length);
    await cutOut({ from: parisTime(day, '00:00'), to: parisTime(day, '23:59') });
    return;
  }
  await sql('delete from call_windows where id = $1', [id]);
}

/** Free 45-minute slots, grouped by Paris day. */
export async function freeSlots() {
  const [ws, taken] = await Promise.all([
    windows(),
    sql(`select starts_at from call_bookings where status = 'booked' and starts_at > now()`),
  ]);
  const busy = new Set(taken.map((r) => new Date(r.starts_at).getTime()));
  const earliest = Date.now() + LEAD_MINUTES * 60000;
  const latest = Date.now() + HORIZON_DAYS * 86400000;
  const slots = new Set<number>();
  for (const w of ws) {
    // Slots start on the hour or half hour, whatever the window says.
    let t = Math.ceil(w.starts_at.getTime() / 1800000) * 1800000;
    for (; t + CALL_MINUTES * 60000 <= w.ends_at.getTime(); t += STEP_MINUTES * 60000) {
      if (t >= earliest && t <= latest && !busy.has(t) && !looksBusy(t)) slots.add(t);
    }
  }
  const days = new Map<string, { date: string; label: string; times: { iso: string; label: string }[] }>();
  for (const t of [...slots].sort((a, b) => a - b)) {
    const at = new Date(t);
    const { date } = parisParts(at);
    if (!days.has(date)) days.set(date, { date, label: frDay(at), times: [] });
    days.get(date)!.times.push({ iso: at.toISOString(), label: frTime(at) });
  }
  return [...days.values()];
}

type Range = { date: string; start: string; end: string };
const RANGES = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      date: { type: 'string', description: 'YYYY-MM-DD' },
      start: { type: 'string', description: 'HH:MM, 24h, Paris time' },
      end: { type: 'string', description: 'HH:MM, 24h, Paris time' },
    },
    required: ['date', 'start', 'end'],
    additionalProperties: false,
  },
} as const;

/**
 * Reads what the admin wrote (“dispo mardi et jeudi 14h-18h, pas vendredi”) with Claude and updates the windows.
 * Returns Claude's one-line summary of what changed.
 */
export async function updateAvailability(instruction: string): Promise<{ ok: true; summary: string } | { ok: false; error: string }> {
  const apiKey = await setting('ANTHROPIC_API_KEY');
  if (!apiKey) return { ok: false, error: 'no-key' };

  await materialiseDefault();
  const now = new Date();
  const today = parisParts(now).date;
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long' }).format(now);
  const current = (await windows()).map((w) => {
    const a = parisParts(w.starts_at);
    return `${a.date} ${a.time}-${parisParts(w.ends_at).time}`;
  });

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 4096,
    output_config: {
      effort: 'low',
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            clear_all: { type: 'boolean', description: 'true only if the admin wants to wipe every current window first' },
            add: { ...RANGES, description: 'Windows when the admin is free' },
            remove: { ...RANGES, description: 'Time ranges when the admin is no longer free (cut out of the current windows)' },
            summary: { type: 'string', description: 'One short sentence in French saying what changed' },
          },
          required: ['clear_all', 'add', 'remove', 'summary'],
          additionalProperties: false,
        },
      },
    },
    system: `You turn what the admin of The AI Certification writes about their availability for 45-minute calls with ambassador candidates into calendar windows, Paris time.
Today is ${weekday} ${today} (Europe/Paris). Only dates from today to ${HORIZON_DAYS} days ahead.
Read French or English. "mardi" means the next Tuesday (today if it is Tuesday and the hours are still ahead). "tous les mardis" or "chaque mardi" means every Tuesday in the next ${HORIZON_DAYS} days. "le matin" = 09:00-12:00, "l'après-midi" = 14:00-18:00, "le soir" = 18:00-21:00, "toute la journée" = 09:00-19:00, "la semaine" = Monday to Friday.
A window must last at least ${CALL_MINUTES} minutes. Never invent availability the admin did not state.
Current windows (date start-end):
${current.length ? current.join('\n') : '(none)'}`,
    messages: [{ role: 'user', content: instruction.slice(0, 2000) }],
  });

  if (response.stop_reason !== 'end_turn') return { ok: false, error: 'ai' };
  const text = response.content.find((b) => b.type === 'text');
  let plan: { clear_all: boolean; add: Range[]; remove: Range[]; summary: string };
  try {
    plan = JSON.parse(text && text.type === 'text' ? text.text : '');
  } catch {
    return { ok: false, error: 'ai' };
  }

  const valid = (r: Range) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && /^\d{2}:\d{2}$/.test(r.start) && /^\d{2}:\d{2}$/.test(r.end);
  const toSpan = (r: Range) => ({ from: parisTime(r.date, r.start), to: parisTime(r.date, r.end) });

  if (plan.clear_all) await sql('delete from call_windows');
  for (const r of plan.remove.filter(valid)) await cutOut(toSpan(r));
  for (const r of plan.add.filter(valid)) {
    const { from, to } = toSpan(r);
    if (to.getTime() - from.getTime() < CALL_MINUTES * 60000) continue;
    await sql('insert into call_windows (id, starts_at, ends_at) values ($1, $2, $3)', [randomUUID(), from.toISOString(), to.toISOString()]);
  }
  return { ok: true, summary: plan.summary };
}

/** Removes a time range from the windows, splitting a window in two when the range falls in its middle. */
async function cutOut({ from, to }: { from: Date; to: Date }) {
  const hit = await sql('select id, starts_at, ends_at from call_windows where starts_at < $2 and ends_at > $1', [from.toISOString(), to.toISOString()]);
  for (const w of hit) {
    const a = new Date(w.starts_at);
    const b = new Date(w.ends_at);
    await sql('delete from call_windows where id = $1', [w.id]);
    if (a < from) await sql('insert into call_windows (id, starts_at, ends_at) values ($1, $2, $3)', [randomUUID(), a.toISOString(), from.toISOString()]);
    if (b > to) await sql('insert into call_windows (id, starts_at, ends_at) values ($1, $2, $3)', [randomUUID(), to.toISOString(), b.toISOString()]);
  }
}

// ---------- Bookings ----------

const toBooking = (r: Record<string, any>): Booking => ({ ...(r as Booking), starts_at: new Date(r.starts_at), ends_at: new Date(r.ends_at), created_at: new Date(r.created_at) });

export async function upcomingBookings(): Promise<Booking[]> {
  const rows = await sql(`select * from call_bookings where status = 'booked' and ends_at > now() - interval '1 day' order by starts_at`);
  return rows.map(toBooking);
}

export async function bookingByToken(reference: string, token: string): Promise<Booking | null> {
  const [row] = await sql('select * from call_bookings where reference = $1 and token = $2', [reference, token]);
  return row ? toBooking(row) : null;
}

export async function cancelBooking(id: string) {
  const [row] = await sql(`update call_bookings set status = 'canceled' where id = $1 returning calendar_event_id`, [id]);
  if (row?.calendar_event_id) await googleDeleteEvent(row.calendar_event_id).catch(() => {});
}

export type BookInput = { slot: string; first_name: string; last_name: string; email: string; school: string; linkedin: string; prospect?: string };

export async function book(input: BookInput): Promise<{ ok: true; booking: Booking } | { ok: false; error: 'invalid' | 'taken' }> {
  const first = input.first_name.trim().slice(0, 80);
  const email = input.email.trim().toLowerCase().slice(0, 200);
  if (!first || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'invalid' };
  const start = new Date(input.slot);
  if (Number.isNaN(start.getTime())) return { ok: false, error: 'invalid' };

  // The slot must still be on offer (inside a window, ahead of time, free).
  const offered = (await freeSlots()).some((d) => d.times.some((t) => t.iso === start.toISOString()));
  if (!offered) return { ok: false, error: 'taken' };

  const end = new Date(start.getTime() + CALL_MINUTES * 60000);
  const id = randomUUID();
  const reference = `CALL-${randomBytes(3).toString('hex').toUpperCase()}`;
  const token = randomBytes(18).toString('base64url');
  // A personal link (/call?t=…) says for sure which LinkedIn profile booked; the bare ?ref= is only a hint.
  const known = input.prospect ? await prospectByToken(input.prospect) : null;
  const linkedin = known?.linkedin || normaliseLinkedin(input.linkedin);
  try {
    await sql(
      `insert into call_bookings (id, reference, token, starts_at, ends_at, first_name, last_name, email, school, linkedin, prospect_token)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [id, reference, token, start.toISOString(), end.toISOString(), first, input.last_name.trim().slice(0, 80), email, input.school.trim().slice(0, 120), linkedin, known?.token ?? null],
    );
  } catch {
    return { ok: false, error: 'taken' }; // someone took it a second earlier (unique index on the slot)
  }

  const guest = [first, input.last_name.trim()].filter(Boolean).join(' ');
  let meet = { url: '', eventId: null as string | null };
  try {
    meet = await googleCreateMeeting({ start, end, guest, email, school: input.school.trim(), linkedin, reference });
  } catch (err) {
    console.error('[calls] Google Calendar failed, using the fallback link', err);
  }
  if (!meet.url) meet.url = (await setting('MEET_LINK')) || `https://meet.jit.si/TheAICertification-${reference}`;
  await sql('update call_bookings set meet_url = $2, calendar_event_id = $3 where id = $1', [id, meet.url, meet.eventId]);

  if (known?.token) await (await import('./outreach')).markBookedByToken(known.token);
  const [row] = await sql('select * from call_bookings where id = $1', [id]);
  return { ok: true, booking: toBooking(row) };
}

/** “thomas-vangelisti”, “linkedin.com/in/thomas-vangelisti/” → the full profile address. */
export function normaliseLinkedin(v: string) {
  const s = v.trim();
  if (!s) return '';
  const m = s.match(/linkedin\.com\/in\/([^/?#\s]+)/i);
  const slug = m ? m[1] : /^[\w%.-]{3,100}$/.test(s) ? s : '';
  return slug ? `https://www.linkedin.com/in/${slug}/` : '';
}

// ---------- Google Calendar / Meet ----------

const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
export const googleRedirectUri = () => `${siteUrl()}/api/google/callback`;

export async function googleStatus() {
  const [id, secret, refresh] = await Promise.all([setting('GOOGLE_CLIENT_ID'), setting('GOOGLE_CLIENT_SECRET'), setting('GOOGLE_REFRESH_TOKEN')]);
  return { configured: !!(id && secret), connected: !!(id && secret && refresh) };
}

export async function googleAuthUrl(state: string) {
  const clientId = await setting('GOOGLE_CLIENT_ID');
  if (!clientId) return null;
  const q = new URLSearchParams({
    client_id: clientId, redirect_uri: googleRedirectUri(), response_type: 'code', scope: SCOPE,
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

/** Exchanges the code Google sends back for a refresh token, kept (encrypted) in the settings. */
export async function googleConnect(code: string) {
  const [clientId, secret] = await Promise.all([setting('GOOGLE_CLIENT_ID'), setting('GOOGLE_CLIENT_SECRET')]);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: clientId ?? '', client_secret: secret ?? '', redirect_uri: googleRedirectUri(), grant_type: 'authorization_code' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.refresh_token) return false;
  await saveSetting('GOOGLE_REFRESH_TOKEN', data.refresh_token);
  await logAdmin('Google Agenda connecté (jeton Google enregistré)');
  return true;
}

async function googleAccessToken(): Promise<string | null> {
  const [clientId, secret, refresh] = await Promise.all([setting('GOOGLE_CLIENT_ID'), setting('GOOGLE_CLIENT_SECRET'), setting('GOOGLE_REFRESH_TOKEN')]);
  if (!clientId || !secret || !refresh) return null;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: secret, refresh_token: refresh, grant_type: 'refresh_token' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(`Google token refresh failed: ${res.status} ${JSON.stringify(data)}`);
  return data.access_token;
}

/** Creates the event in the admin's Google Calendar with a Meet link; Google emails the invitation to the candidate. */
async function googleCreateMeeting(c: { start: Date; end: Date; guest: string; email: string; school: string; linkedin: string; reference: string }) {
  const token = await googleAccessToken();
  if (!token) return { url: '', eventId: null };
  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      summary: `The AI Certification × ${c.guest}${c.school ? ` (${c.school})` : ''}`,
      description: [`Appel découverte du programme ambassadeurs (${CALL_MINUTES} min).`, c.school && `École : ${c.school}`, c.linkedin && `LinkedIn : ${c.linkedin}`, `Réf. ${c.reference}`]
        .filter(Boolean).join('\n'),
      start: { dateTime: c.start.toISOString(), timeZone: TZ },
      end: { dateTime: c.end.toISOString(), timeZone: TZ },
      attendees: [{ email: c.email, displayName: c.guest }],
      conferenceData: { createRequest: { requestId: c.reference, conferenceSolutionKey: { type: 'hangoutsMeet' } } },
      reminders: { useDefault: true },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google Calendar ${res.status}: ${JSON.stringify(data)}`);
  return { url: String(data.hangoutLink ?? ''), eventId: String(data.id ?? '') || null };
}

async function googleDeleteEvent(eventId: string) {
  const token = await googleAccessToken();
  if (!token) return;
  await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  });
}

// ---------- Prospects (personal /call links) and the LinkedIn sender ----------
// The outreach script on the admin's Mac registers each LinkedIn prospect and gets a token for their personal link,
// then asks every few minutes which bookings still need the video link sent in the LinkedIn conversation.

export type Prospect = { token: string; linkedin: string; first_name: string; last_name: string; school: string };

export async function prospectByToken(token: string): Promise<Prospect | null> {
  if (!/^[\w-]{6,40}$/.test(token)) return null;
  const [row] = await sql('select token, linkedin, first_name, last_name, school from call_prospects where token = $1', [token]);
  return (row as Prospect) ?? null;
}

/** One token per LinkedIn profile: registering the same profile again returns its existing token. */
export async function registerProspect(p: { linkedin: string; first_name?: string; last_name?: string; school?: string }) {
  const linkedin = normaliseLinkedin(p.linkedin);
  if (!linkedin) return null;
  const [existing] = await sql('select token from call_prospects where linkedin = $1', [linkedin]);
  if (existing) return String(existing.token);
  const token = randomBytes(6).toString('base64url');
  await sql(
    'insert into call_prospects (token, linkedin, first_name, last_name, school) values ($1, $2, $3, $4, $5)',
    [token, linkedin, (p.first_name ?? '').slice(0, 80), (p.last_name ?? '').slice(0, 80), (p.school ?? '').slice(0, 120)],
  );
  return token;
}

/** Bookings whose video link has not been sent on LinkedIn yet (upcoming calls with a known profile). */
export async function pendingLinkedinNotices() {
  const rows = await sql(
    `select id, reference, starts_at, first_name, linkedin, meet_url from call_bookings
     where status = 'booked' and linkedin <> '' and linkedin_notified_at is null and starts_at > now() order by created_at`,
  );
  return rows.map((r) => ({ id: String(r.id), reference: String(r.reference), first_name: String(r.first_name), linkedin: String(r.linkedin), meet_url: String(r.meet_url), when: `${frDay(new Date(r.starts_at))} à ${frTime(new Date(r.starts_at))}` }));
}

export async function markLinkedinNotified(id: string) {
  await sql('update call_bookings set linkedin_notified_at = now() where id = $1', [id]);
}
