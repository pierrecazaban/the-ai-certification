import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { budget, funnel, recentLog, schoolCounts, visuals } from '@/lib/outreach';

export const dynamic = 'force-dynamic';

// Live data of the side panel in /admin › Prospection (admins only).
export async function GET() {
  const user = await currentUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  const [b, f, counts, events, v] = await Promise.all([budget(), funnel(), schoolCounts(), recentLog(15), visuals()]);
  const listed = Object.values(counts).reduce((a, n) => a + n, 0);
  const full = Object.values(counts).filter((n) => n >= b.config.perSchool).length;
  return NextResponse.json({
    paused: b.config.paused,
    target: b.config.schools.length * b.config.perSchool,
    listed, schoolsFull: full, schools: b.config.schools.length,
    today: b.today, invitesPerDay: b.config.invitesPerDay, weeklyCap: b.config.weeklyCap,
    funnel: f,
    lastAt: events[0]?.at ?? null,
    events,
    toHandle: events.filter((e) => e.kind === 'à traiter').length,
    perSchool: b.config.perSchool,
    schoolOrder: b.config.schools,
    days: v.days,
    schoolStats: v.schools,
  });
}
