import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { bookletAccess } from '@/lib/learning/bookletAccess';

export const dynamic = 'force-dynamic';

// Le fascicule d'un module (PDF, 24/11), pour les élèves connectés du cours seulement : même règle d'accès que la page
// du module (lib/learning/bookletAccess). Les fichiers sont dans fascicules/ (scripts/fascicules.mjs), joints à cette route
// par next.config.mjs. Depuis le 26/11 il se lit surtout dans la page du module (BookletViewer) ; ce PDF reste à télécharger.
export async function GET(req: NextRequest, { params }: { params: Promise<{ program: string; id: string }> }) {
  const { program, id } = await params;
  const access = await bookletAccess(req, program, id);
  if (access instanceof NextResponse) return access;
  const pdf = await readFile(path.join(process.cwd(), 'fascicules', access.file)).catch(() => null);
  if (!pdf) return new NextResponse('Not found', { status: 404 });
  const name = access.lang === 'fr' ? `Fascicule-module-${access.n}.pdf` : `Booklet-module-${access.n}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'content-length': String(pdf.length),
      // « inline » : le PDF s'ouvre dans le lecteur du téléphone ou du navigateur, d'où on peut l'enregistrer.
      'content-disposition': `inline; filename="${name}"`,
      // Gardé une journée sur l'appareil de l'élève : il se rouvre tout de suite. Jamais dans un cache partagé.
      'cache-control': 'private, max-age=86400',
    },
  });
}
