import { NextRequest, NextResponse } from 'next/server';
import { relancesKeyOk } from '@/lib/relances';
import { ambassadorByToolCode } from '@/lib/team';

// Appelé seulement par le serveur Smart Mail (son IP + la clé partagée) : ce code personnel ouvre-t-il le tool,
// et à quel ambassadeur rattache-t-il la personne ? (18/11)
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const ip = req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  if (!(await relancesKeyOk(req.headers.get('x-relances-key'), ip))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const a = await ambassadorByToolCode(req.nextUrl.searchParams.get('c') ?? '');
  return NextResponse.json(a ? { ok: true, name: `${a.first_name} ${a.last_name}`.trim(), admin: a.role === 'admin' } : { ok: false },
    { headers: { 'Cache-Control': 'no-store' } });
}
