import { NextRequest, NextResponse } from 'next/server';
import { registrationPrefill } from '@/lib/school';

// Link of the reminder sent by the school ambassador: back to the registration form, already filled in.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') ?? '';
  const token = req.nextUrl.searchParams.get('t') ?? '';
  let target = '/register';
  try {
    const pre = await registrationPrefill(id, token);
    if (pre?.paidUrl) target = pre.paidUrl;
    else if (pre) target = `/register?lang=${pre.locale}&r=${encodeURIComponent(id)}&t=${encodeURIComponent(token)}`;
  } catch (error) {
    console.error('[finish]', error);
  }
  return NextResponse.redirect(new URL(target, req.nextUrl.origin), 303);
}
