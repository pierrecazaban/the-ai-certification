import { NextRequest, NextResponse } from 'next/server';
import { pendingLinkedinNotices } from '@/lib/calls';
import { scriptAuthorised } from '@/lib/callsApi';

export const dynamic = 'force-dynamic';

// Booked calls whose video link still has to be sent in the candidate's LinkedIn conversation.
export async function GET(req: NextRequest) {
  if (!(await scriptAuthorised(req))) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  return NextResponse.json({ pending: await pendingLinkedinNotices() });
}
