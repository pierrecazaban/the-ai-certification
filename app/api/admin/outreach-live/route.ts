import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { budget, funnel, recentLog, schoolCounts, visuals } from '@/lib/outreach';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Live data of the side panel in /admin › Prospection (admins only).
export async function GET() {
  const user = await currentUser();
  if (user?.role !== 'admin') return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  const [b, f, counts, events, v] = await Promise.all([budget(), funnel(), schoolCounts(), recentLog(15), visuals()]);
  const listed = Object.values(counts).reduce((a, n) => a + n, 0);
  // Une école est « complète » seulement quand on y a obtenu un contact (22/11).
  const full = (await sql(`select count(distinct school)::int as n from outreach_prospects where contact_at is not null and school <> ''`))[0].n;
  // Totaux comptés sur les dates (22/11), pas sur le statut du moment : quelqu'un qui a répondu reste compté comme accepté.
  const DAY = `date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris'`;
  const [t] = await sql(`select
      count(invited_at)::int as invited, count(accepted_at)::int as accepted, count(messaged_at)::int as linked,
      count(contact_at)::int as contacts, count(booked_at)::int as booked, count(declined_at)::int as declined,
      count(*) filter (where accepted_at >= ${DAY})::int as accepted_today
    from outreach_prospects`);
  const invitesLeftToday = b.invitesLeft;
  const messagesWaiting = (await sql(`select count(*)::int as n from outreach_prospects where accepted_at is not null and messaged_at is null and declined_at is null`))[0].n;
  return NextResponse.json({
    paused: b.config.paused,
    target: b.config.schools.length * b.config.perSchool,
    listed, schoolsFull: full, schools: b.config.schools.length,
    today: b.today, invitesPerDay: b.config.invitesPerDay, weeklyCap: b.config.weeklyCap,
    funnel: f,
    totals: t, invitesLeftToday, messagesPerDay: b.config.messagesPerDay, messagesWaiting,
    lastAt: events[0]?.at ?? null,
    events,
    toHandle: events.filter((e) => e.kind === 'à traiter').length,
    perSchool: b.config.perSchool,
    schoolOrder: b.config.schools,
    days: v.days,
    schoolStats: v.schools,
  });
}
