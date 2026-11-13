import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { sql } from '@/lib/db';
import { PRIVATE_SLUGS } from '@/lib/private';

export const dynamic = 'force-dynamic';

// A visitor counts as live while their tab keeps pinging (every 30 s while visible).
const LIVE_SECONDS = 75;
const VID_RE = /^[a-z0-9]{8,40}$/;

// Ping from an open page: a random tab id and the page path. Nothing else is stored.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const vid = String(body?.vid ?? '');
  const path = String(body?.path ?? '/').slice(0, 200);
  if (!VID_RE.test(vid) || !path.startsWith('/')) return NextResponse.json({ ok: false }, { status: 400 });
  // The admin console is not counted as a visit (a tab that moves there leaves the count).
  const adminPage = path === `/${PRIVATE_SLUGS.admin}` || path.startsWith(`/${PRIVATE_SLUGS.admin}/`);
  if (body?.leave || adminPage) {
    await sql('delete from live_visitors where vid = $1', [vid]);
  } else {
    await sql(
      `insert into live_visitors (vid, path, seen_at) values ($1, $2, now())
       on conflict (vid) do update set path = excluded.path, seen_at = now()`,
      [vid, path],
    );
  }
  // Old rows are dropped now and then so the table stays tiny.
  if (Math.random() < 0.05) await sql(`delete from live_visitors where seen_at < now() - interval '1 hour'`);
  return NextResponse.json({ ok: true });
}

// Live count for the admin console only.
export async function GET() {
  const user = await currentUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'not found' }, { status: 404 });
  const pages = await sql(
    `select path, count(*)::int as n from live_visitors
     where seen_at > now() - make_interval(secs => $1) group by path order by n desc, path limit 6`,
    [LIVE_SECONDS],
  );
  const total = pages.reduce((s, p) => s + Number(p.n), 0);
  return NextResponse.json({ total, pages }, { headers: { 'Cache-Control': 'no-store' } });
}
