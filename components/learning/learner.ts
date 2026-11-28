import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { hasCourse } from '@/lib/learning';
import { getProgress, hasPaidAccess } from '@/lib/learning/progress';
import { STUDENT_PROGRAM } from '@/lib/catalog';
import { sql } from '@/lib/db';
import { noteLoginArrival } from '@/lib/loginArrivals';
import { memberLog } from '@/lib/saleLog';

// Suivi des pages du cours (28/11, demandé par un associé) : chaque ouverture d'un module, de l'examen ou du certificat
// est notée avec les numéros d'inscription payés du membre (registre + /admin › Réglages), refus d'accès compris.
async function noteCourseVisit(where: string, user: { id: string; role: string }, allowed: boolean) {
  if (user.role === 'admin') return;
  try {
    const refs = (await sql(`select reference from registrations where user_id = $1 and status = 'paid' order by paid_at desc limit 5`, [user.id]))
      .map((r) => String(r.reference));
    const path = allowed ? where : `${where} (accès refusé)`;
    memberLog('cours', refs, user.role, { page: path });
    await noteLoginArrival(path, {}, { who: refs.join(' ') });
  } catch {
    // never block the course
  }
}

/** The signed-in learner of a course and where they stand; anyone else is sent to the right place. */
export async function requireLearner(program: string, where = `/space/${program}`) {
  if (!hasCourse(program)) notFound();
  const user = await currentUser();
  if (!user) redirect('/login');
  // Admins follow every course like a learner, to test it, without paying; ambassadors do the same with the
  // student course they recommend. Any other course needs a payment.
  const free = user.role === 'admin' || (user.role === 'ambassador' && program === STUDENT_PROGRAM);
  const allowed = free || (await hasPaidAccess(user.id, program));
  await noteCourseVisit(where, user, allowed);
  if (!allowed) redirect('/space');
  const progress = await getProgress(user.id, user.locale, program);
  if (!progress) redirect('/space');
  return { user, progress, program };
}
