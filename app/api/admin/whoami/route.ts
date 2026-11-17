import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';

// Asked by the Smart Mail server (via /tool) to know whether the visitor is this site's admin.
// It reveals nothing else: only yes or no for the session cookie it receives.
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await currentUser();
  return NextResponse.json({ admin: user?.role === 'admin' }, { headers: { 'Cache-Control': 'no-store' } });
}
