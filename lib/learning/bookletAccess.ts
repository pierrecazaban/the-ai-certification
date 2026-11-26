import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { STUDENT_PROGRAM } from '@/lib/catalog';
import { hasCourse } from '@/lib/learning';
import { bookletFile } from '@/lib/learning/booklets';
import { getProgress, hasPaidAccess } from '@/lib/learning/progress';

/**
 * Qui peut ouvrir le fascicule d'un module (24/11, mis en commun le 26/11) : la même règle que la page du module.
 * Élève connecté qui a payé le cours ; l'admin ; un ambassadeur pour le cours étudiant. Rend le fichier PDF
 * (« fr/v2-m1.pdf »), la langue des images et le numéro du module, ou la réponse à renvoyer telle quelle.
 */
export async function bookletAccess(req: NextRequest, program: string, id: string): Promise<{ file: string; lang: 'fr' | 'en'; n: number } | NextResponse> {
  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL('/login', req.url));
  if (!hasCourse(program)) return new NextResponse('Not found', { status: 404 });
  const free = user.role === 'admin' || (user.role === 'ambassador' && program === STUDENT_PROGRAM);
  if (!free && !(await hasPaidAccess(user.id, program))) return NextResponse.redirect(new URL('/space', req.url));
  const progress = await getProgress(user.id, user.locale, program);
  const file = progress && bookletFile(progress.course, progress.locale, id);
  if (!progress || !file) return new NextResponse('Not found', { status: 404 });
  return { file, lang: file.startsWith('fr/') ? 'fr' : 'en', n: progress.course.modules.findIndex((m) => m.id === id) + 1 };
}
