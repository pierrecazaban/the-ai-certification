import { NextRequest, NextResponse } from 'next/server';
import { relancesKeyOk, unfinishedRegistrations } from '@/lib/relances';

// Read by the Smart Mail server only (its IP, plus the shared key when set): who started registering but has not paid.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const ip = req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  if (!(await relancesKeyOk(req.headers.get('x-relances-key'), ip))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json({ registrations: await unfinishedRegistrations() }, { headers: { 'Cache-Control': 'no-store' } });
}
