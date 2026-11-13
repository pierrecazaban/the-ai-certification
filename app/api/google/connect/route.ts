import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { googleAuthUrl } from '@/lib/calls';
import { PRIVATE_SLUGS } from '@/lib/private';
import { siteUrl } from '@/lib/site';

export const dynamic = 'force-dynamic';

// “Connect Google Calendar” in /admin › Calls: sends the admin to Google's consent screen (in their usual browser).
export async function GET() {
  const user = await currentUser();
  if (user?.role !== 'admin') return NextResponse.redirect(`${siteUrl()}/`);
  const state = randomBytes(16).toString('hex');
  const url = await googleAuthUrl(state);
  if (!url) return NextResponse.redirect(`${siteUrl()}/${PRIVATE_SLUGS.admin}?tab=appels&msg=google-setup`);
  (await cookies()).set('tac_google_state', state, { httpOnly: true, secure: siteUrl().startsWith('https'), sameSite: 'lax', maxAge: 600, path: '/' });
  return NextResponse.redirect(url);
}
