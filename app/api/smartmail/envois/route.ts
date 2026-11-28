import { NextRequest, NextResponse } from 'next/server';
import { relancesKeyOk } from '@/lib/relances';
import { saveSendFeed } from '@/lib/sendCalendar';

export const dynamic = 'force-dynamic';

// Calendrier des envois (28/11) : chaque serveur Smart Mail envoie toutes les 10 minutes ses mails reçus par les élèves,
// compte par compte et heure par heure (aucune adresse d'élève). Réservé aux serveurs Smart Mail (leur adresse IP + la
// clé partagée des relances), comme /api/outreach/coverage.
//   POST /api/smartmail/envois { source: 'smartmail-ovh' | 'smartmail-paris',
//                                accounts: [{ id, domain, first_name, active }], hours: [[compte, heure epoch / 3600, mails], …],
//                                planning: [{ id, statut, prochain, destinataires, attente, max_jour, heure_debut, heure_fin, restants, envoyes, message, maj }] }
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  if (!(await relancesKeyOk(req.headers.get('x-relances-key'), ip))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const ok = await saveSendFeed(String(body?.source ?? ''), body?.accounts, body?.hours, body?.planning);
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}
