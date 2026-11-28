import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { sql } from '@/lib/db';
import { PRIVATE_SLUGS } from '@/lib/private';
import { STAFF_COOKIE } from '@/lib/staffDevice';

export const dynamic = 'force-dynamic';

// A visitor counts as live while their tab keeps pinging (every 30 s while visible).
const LIVE_SECONDS = 75;
const VID_RE = /^[a-z0-9]{8,40}$/;

// Ping from an open page: a random tab id and the page path. Nothing else is stored.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const vid = String(body?.vid ?? '');
  const pid = VID_RE.test(String(body?.pid ?? '')) ? String(body.pid) : vid;
  const path = String(body?.path ?? '/').slice(0, 200);
  if (!VID_RE.test(vid) || !path.startsWith('/')) return NextResponse.json({ ok: false }, { status: 400 });
  // The admin console is not counted as a visit (a tab that moves there leaves the count).
  const adminPage = path === `/${PRIVATE_SLUGS.admin}` || path.startsWith(`/${PRIVATE_SLUGS.admin}/`);
  // The admin's own visits are not counted, on any page.
  const admin = adminPage || (await currentUser().catch(() => null))?.role === 'admin';
  if (body?.leave || admin) {
    await sql('delete from live_visitors where vid = $1', [vid]);
  } else {
    await sql(
      `insert into live_visitors (vid, pid, path, seen_at) values ($1, $3, $2, now())
       on conflict (vid) do update set path = excluded.path, pid = excluded.pid, seen_at = now()`,
      [vid, path, pid],
    );
  }
  // Old rows are dropped now and then so the table stays tiny.
  if (Math.random() < 0.05) await sql(`delete from live_visitors where seen_at < now() - interval '1 hour'`);
  const res = NextResponse.json({ ok: true });
  // Appareil de l'équipe (28/11) : marqué dès qu'il ouvre l'admin, pour que ses visites de /login et /space ne soient
  // pas notées dans les arrivées (lib/loginArrivals.ts, middleware.ts), même déconnecté. Aucune donnée, juste « 1 ».
  if (admin) res.cookies.set(STAFF_COOKIE, '1', { path: '/', maxAge: 60 * 60 * 24 * 400, httpOnly: true, sameSite: 'lax', secure: true });
  return res;
}

// Live count for the admin console only.
export async function GET() {
  const user = await currentUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'not found' }, { status: 404 });
  // People, not tabs (several tabs of one browser count once), on every page, not only the top 6.
  const [{ total }] = await sql(
    `select count(distinct coalesce(pid, vid))::int as total from live_visitors where seen_at > now() - make_interval(secs => $1)`,
    [LIVE_SECONDS],
  );
  const pages = await sql(
    `select path, count(distinct coalesce(pid, vid))::int as n from live_visitors
     where seen_at > now() - make_interval(secs => $1) group by path order by n desc, path limit 6`,
    [LIVE_SECONDS],
  );
  return NextResponse.json({ total, pages }, { headers: { 'Cache-Control': 'no-store' } });
}
