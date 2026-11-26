import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { bookletAccess } from '@/lib/learning/bookletAccess';
import { bookletPages } from '@/lib/learning/booklets';

export const dynamic = 'force-dynamic';

// Une page du fascicule en image (26/11), pour le lire dans la page du module (components/learning/BookletViewer) sans
// la quitter. Même règle d'accès que le PDF. Images écrites par scripts/fascicules-pages.mjs dans
// fascicules/<langue>/<module>/<n>.jpg, jointes à cette route par next.config.mjs.
export async function GET(req: NextRequest, { params }: { params: Promise<{ program: string; id: string; n: string }> }) {
  const { program, id, n } = await params;
  const access = await bookletAccess(req, program, id);
  if (access instanceof NextResponse) return access;
  const page = /^\d{1,3}$/.test(n) ? Number(n) : 0;
  const total = bookletPages(access.lang, id)?.pages ?? 0;
  if (page < 1 || page > total) return new NextResponse('Not found', { status: 404 });
  const jpg = await readFile(path.join(process.cwd(), 'fascicules', access.lang, id, `${page}.jpg`)).catch(() => null);
  if (!jpg) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(new Uint8Array(jpg), {
    headers: {
      'content-type': 'image/jpeg',
      'content-length': String(jpg.length),
      // Comme le PDF : gardée une journée sur l'appareil de l'élève, jamais dans un cache partagé.
      'cache-control': 'private, max-age=86400',
    },
  });
}
