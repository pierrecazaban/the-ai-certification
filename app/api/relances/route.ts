import { NextRequest, NextResponse, after } from 'next/server';
import { relancesKeyOk, unfinishedRegistrations } from '@/lib/relances';
import { watchRelanceClock } from '@/lib/payReminder';

// Called by the Smart Mail servers only (their IP, plus the shared key when set), every 10 minutes between 18:00 and
// 21:00 Paris time: who started registering but has not paid.
// Since 23/11 the reminders no longer leave from the ambassadors' mailboxes: the site sends them itself, one Kai e-mail
// per person (lib/payReminder.ts), and answers here with an empty list so Smart Mail writes to nobody.
// The reminders are triggered by a scheduled task on the two servers (/api/relances/campagne). This poll is a third,
// independent clock: it only checks that the task still turns, and warns the admin when it does not.
// RELANCES_CANAL=smartmail (Vercel) brings the old behaviour back.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const ip = req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  if (!(await relancesKeyOk(req.headers.get('x-relances-key'), ip))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if ((process.env.RELANCES_CANAL ?? 'kai') === 'smartmail') {
    return NextResponse.json({ registrations: await unfinishedRegistrations() }, { headers: { 'Cache-Control': 'no-store' } });
  }
  after(() => watchRelanceClock().then(() => undefined, (err) => console.error('[rappels-paiement]', err)));
  return NextResponse.json({ registrations: [] }, { headers: { 'Cache-Control': 'no-store' } });
}
