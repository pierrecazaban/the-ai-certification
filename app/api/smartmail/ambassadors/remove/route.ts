import { NextRequest, NextResponse } from 'next/server';
import { relancesKeyOk } from '@/lib/relances';
import { removeAmbassadorsByEmail } from '@/lib/team';

export const dynamic = 'force-dynamic';

// Retrait d'ambassadeurs d'école (23/11), appelé seulement par un serveur Smart Mail (son IP + la clé partagée) quand
// l'administrateur y a fermé leur compte : ils sortent aussi du réseau des ambassadeurs sur le site. Dix adresses au plus
// par appel, jamais un administrateur.
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  if (!(await relancesKeyOk(req.headers.get('x-relances-key'), ip))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { emails?: unknown } | null;
  const emails = Array.isArray(body?.emails) ? body!.emails.filter((e): e is string => typeof e === 'string') : [];
  if (!emails.length) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  return NextResponse.json({ ok: true, result: await removeAmbassadorsByEmail(emails) });
}
