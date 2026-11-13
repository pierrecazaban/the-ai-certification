'use server';

// Booking form of /call (public). Admin actions on calls live in privateActions.ts.
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { book, frDay, frTime } from './calls';
import { sendCallBookedEmail } from './email';
import { siteUrl } from './site';

const hits = new Map<string, number[]>();
function rateLimited(ip: string, limit = 8, windowMs = 60 * 60 * 1000) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > limit;
}

export async function bookCallAction(formData: FormData) {
  const get = (k: string) => String(formData.get(k) ?? '');
  const back = (error: string) => {
    const q = new URLSearchParams({ error });
    if (get('prospect')) q.set('t', get('prospect'));
    else if (get('linkedin')) q.set('ref', get('linkedin'));
    redirect(`/call?${q}`);
  };
  if (get('website')) back('invalid'); // honeypot field, invisible to people
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  if (rateLimited(ip)) back('rate');

  const result = await book({
    slot: get('slot'), first_name: get('first_name'), last_name: get('last_name'), email: get('email'), school: get('school'), linkedin: get('linkedin'), prospect: get('prospect'),
  });
  if (!result.ok) return back(result.error);

  const b = result.booking;
  const manageUrl = `${siteUrl()}/call/confirmed?r=${b.reference}&t=${b.token}`;
  await sendCallBookedEmail({ to: b.email, firstName: b.first_name, when: `${frDay(b.starts_at)} à ${frTime(b.starts_at)}`, meetUrl: b.meet_url, reference: b.reference, manageUrl }).catch(() => {});
  redirect(`/call/confirmed?r=${b.reference}&t=${b.token}`);
}
