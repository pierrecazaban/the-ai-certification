import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { googleConnect } from '@/lib/calls';
import { PRIVATE_SLUGS } from '@/lib/private';
import { siteUrl } from '@/lib/site';

export const dynamic = 'force-dynamic';

// Google sends the admin back here after consent; the refresh token is stored encrypted in the settings.
export async function GET(req: NextRequest) {
  const done = (msg: string) => NextResponse.redirect(`${siteUrl()}/${PRIVATE_SLUGS.admin}?tab=appels&msg=${msg}`);
  const user = await currentUser();
  if (user?.role !== 'admin') return NextResponse.redirect(`${siteUrl()}/`);
  const jar = await cookies();
  const expected = jar.get('tac_google_state')?.value;
  jar.delete('tac_google_state');
  const state = req.nextUrl.searchParams.get('state');
  const code = req.nextUrl.searchParams.get('code');
  if (!expected || state !== expected || !code) return done('google-failed');
  return done((await googleConnect(code)) ? 'google-ok' : 'google-failed');
}
