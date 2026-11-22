import { NextRequest, NextResponse } from 'next/server';
import { signInFromSmartMail } from '@/lib/team';

export const dynamic = 'force-dynamic';

// Retour de Smart Mail (23/11) : un ambassadeur d'école qui a programmé ses mails arrive ici avec un jeton signé ;
// son compte est créé la première fois, puis il atterrit sur son espace ambassadeur.
export async function GET(req: NextRequest) {
  const ok = await signInFromSmartMail(req.nextUrl.searchParams.get('t') ?? '');
  // Un étudiant de la certification va dans son espace de cours, un ambassadeur dans le sien (22/11).
  return NextResponse.redirect(new URL(ok === 'student' ? '/space' : ok ? '/ambassador' : '/login?lang=fr&sso=0', req.url), 303);
}
