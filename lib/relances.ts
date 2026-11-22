import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { sql } from './db';
import { setting } from './settings';
import { publicIntake } from './school';
import { siteUrl } from '@/lib/site';

// Unfinished registrations (form filled, never paid) for the reminders Smart Mail sends from the school
// ambassador's own mailbox (14/11). Read only by Smart Mail, with the shared RELANCES_API_KEY.

// The two Smart Mail servers (their fixed IPs, as seen by Vercel); a shared key, when one is set in /admin, is required too.
const SMARTMAIL_IPS = (process.env.SMARTMAIL_IPS ?? '158.69.232.131,2.25.7.244').split(',').map((s) => s.trim());

export async function relancesKeyOk(given: string | null, ip: string | null) {
  if (!ip || !SMARTMAIL_IPS.includes(ip)) return false;
  const key = await setting('RELANCES_API_KEY');
  if (!key) return true;
  if (!given) return false;
  const a = Buffer.from(key);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** One line per person (latest attempt), registered in the last 10 days, who has paid nothing since. */
export async function unfinishedRegistrations() {
  const rows = await sql(
    `select distinct on (lower(r.email))
            r.id, r.client_token, r.first_name, r.email, r.locale, r.created_at,
            i.registration_deadline, u.name as school, u.short_name as school_short, u.email_domains
       from registrations r
       join intakes i on i.id = r.intake_id
       left join universities u on u.id = r.university_id
      where r.program = 'student-ai'
        and r.status not in ('paid', 'refunded')
        and r.created_at > now() - interval '10 days'
        -- Remboursé (18/11) : comme un acheteur, on ne le relance jamais.
        and not exists (select 1 from registrations p where lower(p.email) = lower(r.email) and p.status in ('paid', 'refunded'))
      order by lower(r.email), r.created_at desc`,
  );
  // A registration whose own cohort has closed is finished in today's cohort: its deadline is today's.
  const today = await publicIntake().catch(() => null);
  const base = siteUrl();
  return rows.map((r) => {
    const own = new Date(r.registration_deadline);
    const deadline = own > new Date() ? own : today ? new Date(today.registration_deadline) : own;
    return {
      id: String(r.id),
      first_name: String(r.first_name ?? '').trim(),
      email: String(r.email).toLowerCase(),
      locale: String(r.locale ?? 'en-us'),
      school: r.school ? String(r.school) : '',
      school_short: r.school_short ? String(r.school_short) : '',
      school_domains: ((r.email_domains as string[]) ?? []).map((d) => String(d).toLowerCase()),
      created_at: new Date(r.created_at).toISOString(),
      deadline: deadline.toISOString(),
      link: `${base}/finish?id=${r.id}&t=${encodeURIComponent(String(r.client_token))}`,
    };
  });
}
