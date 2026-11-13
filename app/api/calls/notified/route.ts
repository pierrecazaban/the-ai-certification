import { NextRequest, NextResponse } from 'next/server';
import { markLinkedinNotified } from '@/lib/calls';
import { scriptAuthorised } from '@/lib/callsApi';

export const dynamic = 'force-dynamic';

// The script says the LinkedIn message went out. Body: { id }
export async function POST(req: NextRequest) {
  if (!(await scriptAuthorised(req))) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (typeof body?.id !== 'string') return NextResponse.json({ error: 'id' }, { status: 400 });
  await markLinkedinNotified(body.id);
  return NextResponse.json({ ok: true });
}
