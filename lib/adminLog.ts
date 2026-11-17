import 'server-only';
import { headers } from 'next/headers';
import { sql } from './db';

// Journal of everything done in the admin (15/11): sign-ins and failed attempts on the admin account, every page
// opened, every action. Kept in the database (table admin_log), shown in /admin › Journal. Never a password or a key.

export type AdminLogUser = { id?: string; email?: string } | null | undefined;

async function origin() {
  try {
    const h = await headers();
    const ip = h.get('x-real-ip') ?? h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '';
    const country = h.get('x-vercel-ip-country') ?? '';
    const city = decodeURIComponent(h.get('x-vercel-ip-city') ?? '');
    return { ip, place: [city, country].filter(Boolean).join(', '), ua: (h.get('user-agent') ?? '').slice(0, 300) };
  } catch {
    return { ip: '', place: '', ua: '' };
  }
}

/** Never throws: a journal problem must not block the admin. */
export async function logAdmin(action: string, detail = '', user?: AdminLogUser) {
  try {
    const o = await origin();
    await sql(
      `insert into admin_log (user_id, email, ip, place, ua, action, detail) values ($1, $2, $3, $4, $5, $6, $7)`,
      [user?.id ?? null, user?.email ?? '', o.ip, o.place, o.ua, action.slice(0, 80), detail.slice(0, 500)],
    );
  } catch (error) {
    console.error('[admin_log]', error);
  }
}

/** The form fields of an action, without anything secret (values cut short, IBAN and passwords left out). */
export function describeForm(formData?: FormData) {
  if (!formData) return '';
  const parts: string[] = [];
  for (const [k, v] of formData.entries()) {
    if (k.startsWith('$ACTION')) continue;
    if (/pass|iban|bic|secret|key|token|value/i.test(k)) { parts.push(`${k}=•••`); continue; }
    parts.push(`${k}=${String(v).slice(0, 60)}`);
  }
  return parts.join(' · ');
}

export async function adminLogEntries(limit = 300) {
  return sql(`select at, email, ip, place, ua, action, detail from admin_log order by at desc limit $1`, [limit]);
}
