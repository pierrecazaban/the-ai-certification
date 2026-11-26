import { NextRequest, NextResponse } from 'next/server';
import { relancesKeyOk } from '@/lib/relances';
import { saveCoverageFeed } from '@/lib/prospection';

export const dynamic = 'force-dynamic';

// Couverture des écoles (26/11) : chaque serveur Smart Mail envoie toutes les 10 minutes les domaines des adresses de
// ses ambassadeurs (aucun nom, aucune adresse). Une école dont un domaine y figure n'est plus prospectée sur LinkedIn.
// Réservé aux serveurs Smart Mail (leur adresse IP + la clé partagée des relances), comme /api/relances.
//   POST /api/outreach/coverage { source: 'smartmail-ovh' | 'smartmail-paris', domains: ['kedgebs.com', …] }
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  if (!(await relancesKeyOk(req.headers.get('x-relances-key'), ip))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const ok = await saveCoverageFeed(String(body?.source ?? ''), body?.domains);
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}
