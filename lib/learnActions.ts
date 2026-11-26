'use server';

// Form actions of the course pages. Each one checks the session and the learner's access itself.
import { randomUUID } from 'node:crypto';
import { logAdmin } from './adminLog';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { currentUser } from './auth';
import { sql } from './db';
import { examDraw, hasCourse } from './learning';
import { STUDENT_PROGRAM } from './catalog';
import { RATING_COMMENT_MIN } from './rating';
import { isLeadNetwork, leadLink, leadNetworkLabel, LEAD_HANDLE_MAX, LEAD_HANDLE_MIN, LEAD_SCHOOLS_MAX } from './leadNetworks';
import { saveLead } from './ambassadorLeads';
import { sendOutreachAlert } from './email';
import { certificateReference, examPassMark, examSize, getProgress, grade, hasPaidAccess } from './learning/progress';

const MIN_SUBMISSION = 40;

// Every form names its course; the learner must have paid for it (admins test every course).
async function learner(formData: FormData) {
  const program = String(formData.get('program') ?? '');
  if (!hasCourse(program)) redirect('/space');
  const user = await currentUser();
  if (!user) redirect('/login');
  const free = user.role === 'admin' || (user.role === 'ambassador' && program === STUDENT_PROGRAM);
  if (!free && !(await hasPaidAccess(user.id, program))) redirect('/space');
  const progress = await getProgress(user.id, user.locale, program);
  if (!progress) redirect('/space');
  return { user, progress, program, base: `/space/${program}` };
}

const answersOf = (formData: FormData) =>
  Object.fromEntries([...formData.entries()].filter(([k]) => /^q\d+$/.test(k)).map(([k, v]) => [k, String(v)]));

export async function toggleLessonAction(formData: FormData) {
  const { user, progress, program, base } = await learner(formData);
  const lesson = String(formData.get('lesson') ?? '');
  const module = progress.course.modules.find((m) => m.lessons.some((l) => l.id === lesson));
  if (!module) return;
  if (formData.get('done') === '1') {
    await sql('insert into lesson_progress (user_id, lesson_id) values ($1, $2) on conflict do nothing', [user.id, lesson]);
  } else {
    await sql('delete from lesson_progress where user_id = $1 and lesson_id = $2', [user.id, lesson]);
  }
  revalidatePath('/space');
  redirect(`${base}/module/${module.id}#${lesson}`);
}

export async function submitExerciseAction(formData: FormData) {
  const { user, progress, program, base } = await learner(formData);
  const moduleId = String(formData.get('module') ?? '');
  const module = progress.course.modules.find((m) => m.id === moduleId);
  if (!module) redirect('/space');
  const content = String(formData.get('content') ?? '').trim().slice(0, 20000);
  if (content.length < MIN_SUBMISSION) redirect(`${base}/module/${moduleId}?exercise=short#exercise`);
  await sql(
    `insert into exercise_submissions (user_id, program, exercise_id, content) values ($1, $2, $3, $4)
     on conflict (user_id, program, exercise_id) do update set content = excluded.content, submitted_at = now()`,
    [user.id, program, module.exercise.id, content],
  );
  redirect(`${base}/module/${moduleId}#exercise`);
}

export async function submitQuizAction(formData: FormData) {
  const { user, progress, program, base } = await learner(formData);
  const moduleId = String(formData.get('module') ?? '');
  const module = progress.course.modules.find((m) => m.id === moduleId);
  if (!module) redirect('/space');
  const { score, chosen } = grade(module.quiz, answersOf(formData));
  if (chosen.some((c) => c === null)) redirect(`${base}/module/${moduleId}?quiz=incomplete#quiz`);
  const id = randomUUID();
  await sql(
    `insert into quiz_attempts (id, user_id, program, module_id, score, total, answers) values ($1, $2, $3, $4, $5, $6, $7)`,
    [id, user.id, program, moduleId, score, module.quiz.length, JSON.stringify(chosen)],
  );
  redirect(`${base}/module/${moduleId}?attempt=${id}#quiz`);
}

export async function submitExamAction(formData: FormData) {
  const { user, progress, program, base } = await learner(formData);
  if (progress.certificate) redirect(`${base}/certificate`);
  // Unlimited attempts, one right after another.
  if (!progress.examUnlocked) redirect('/space');
  // First and last name, both required: the certificate shows the full name.
  const part = (k: string) => String(formData.get(k) ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
  const first = part('holder_first');
  const last = part('holder_last');
  if (!first || !last) redirect(`${base}/exam?error=name`);
  const holder = `${first} ${last}`;
  // The same draw as the exam page showed (it depends on the attempts made before this one).
  const [{ n: attempts }] = await sql('select count(*)::int as n from exam_attempts where user_id = $1 and program = $2', [user.id, program]);
  const exam = examDraw(progress.course.exam.length, `${user.id}:${program}:${attempts}`, examSize(progress.course)).map((i) => progress.course.exam[i]);
  const { score, chosen } = grade(exam, answersOf(formData));
  if (chosen.some((c) => c === null)) redirect(`${base}/exam?error=incomplete`);
  const passed = score >= examPassMark(exam.length, progress.course.examPass);
  await sql(`insert into exam_attempts (id, user_id, program, score, total, passed) values ($1, $2, $3, $4, $5, $6)`, [
    randomUUID(), user.id, program, score, exam.length, passed,
  ]);
  if (!passed) redirect(`${base}/exam?result=failed`);
  await sql(
    `insert into certificates (reference, user_id, program, holder_name, score, total) values ($1, $2, $3, $4, $5, $6)
     on conflict (user_id, program) do nothing`,
    [certificateReference(), user.id, program, holder, score, exam.length],
  );
  redirect(`${base}/certificate`);
}

/** Admins testing the course: wipe their own progress, quizzes, exam attempts and certificate. */
export async function resetMyProgressAction() {
  const user = await currentUser();
  if (!user || user.role !== 'admin') redirect('/');
  await logAdmin('Progression de test remise à zéro (vue étudiant)', '', user);
  await sql('delete from lesson_progress where user_id = $1', [user.id]);
  for (const table of ['exercise_submissions', 'quiz_attempts', 'exam_attempts', 'certificates', 'ambassador_leads']) {
    await sql(`delete from ${table} where user_id = $1`, [user.id]);
  }
  redirect('/space');
}

/** Admins testing the course: record a passed final exam (full marks) and issue the certificate, to see what follows. */
export async function simulatePassedExamAction(formData: FormData) {
  const user = await currentUser();
  if (!user || user.role !== 'admin') redirect('/');
  const program = STUDENT_PROGRAM;
  const progress = await getProgress(user.id, user.locale, program);
  if (!progress) redirect('/space');
  const total = examSize(progress.course);
  await logAdmin('Examen final simulé comme réussi (vue étudiant)', '', user);
  await sql(`insert into exam_attempts (id, user_id, program, score, total, passed) values ($1, $2, $3, $4, $5, true)`, [
    randomUUID(), user.id, program, total, total,
  ]);
  const part = (k: string) => String(formData.get(k) ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
  const holder = [part('holder_first') || user.first_name, part('holder_last') || user.last_name].filter(Boolean).join(' ') || user.email;
  await sql(
    `insert into certificates (reference, user_id, program, holder_name, score, total) values ($1, $2, $3, $4, $5, $6)
     on conflict (user_id, program) do nothing`,
    [certificateReference(), user.id, program, holder, total, total],
  );
  revalidatePath('/space');
  redirect(`/space/${program}/certificate`);
}

/**
 * The Trustpilot screen of the certificate page (shown after a 5-star rating only): notes that it was seen, or that its
 * button was clicked (23/11). Called from the browser, changes nothing else and never redirects. A click says the
 * learner opened Trustpilot, not that a review was posted there.
 */
export async function trustpilotEventAction(formData: FormData) {
  const program = String(formData.get('program') ?? '');
  const event = String(formData.get('event') ?? '');
  const user = await currentUser();
  if (!user || !hasCourse(program)) return;
  if (event === 'click') {
    await sql(
      `update certificates set tp_clicks = tp_clicks + 1, tp_clicked_at = coalesce(tp_clicked_at, now()), tp_shown_at = coalesce(tp_shown_at, now())
        where user_id = $1 and program = $2 and rating = 5`,
      [user.id, program],
    );
  } else if (event === 'shown') {
    await sql(`update certificates set tp_shown_at = coalesce(tp_shown_at, now()) where user_id = $1 and program = $2 and rating = 5`, [user.id, program]);
  } else if (event === 'done') {
    // End of the countdown (24/11): the step is passed even if the note of the click itself was lost. Not one more click.
    await sql(
      `update certificates set tp_clicked_at = coalesce(tp_clicked_at, now()), tp_shown_at = coalesce(tp_shown_at, now())
        where user_id = $1 and program = $2 and rating = 5`,
      [user.id, program],
    );
  }
}

/**
 * The learner rates the course before the certificate is shown (24/11, it used to open only the LinkedIn block):
 * 1 to 5 stars and a review of at least 25 characters.
 */
export async function rateCertificateAction(formData: FormData) {
  const { user, progress, program, base } = await learner(formData);
  if (!progress.certificate) redirect(base);
  const rating = Number(formData.get('rating'));
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) redirect(`${base}/certificate?rate=missing#etape`);
  const comment = String(formData.get('comment') ?? '').trim().slice(0, 2000);
  // Counted without the padding: 25 spaces are not a review.
  if (comment.replace(/\s+/g, ' ').length < RATING_COMMENT_MIN) redirect(`${base}/certificate?rate=short#etape`);
  await sql(
    `update certificates set rating = $3, rating_comment = $4, rated_at = now() where user_id = $1 and program = $2`,
    [user.id, program, rating, comment],
  );
  redirect(`${base}/certificate?rated=1#etape`);
}

/**
 * "Do you want to become an ambassador?", asked once per learner between the rating and the certificate (24/11): yes
 * with a social network and where to reach them, or no. A yes sends the owner an e-mail, and he contacts them himself.
 */
export async function ambassadorAnswerAction(formData: FormData) {
  const { user, progress, program, base } = await learner(formData);
  const cert = progress.certificate;
  if (!cert) redirect(base);
  const back = `${base}/certificate`;
  if (cert.rating == null) redirect(back);
  const interested = formData.get('answer') === 'yes';
  const field = (k: string, max: number) => String(formData.get(k) ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
  const network = field('network', 20);
  const handle = field('handle', LEAD_HANDLE_MAX);
  const schools = field('schools', LEAD_SCHOOLS_MAX);
  if (interested && (!isLeadNetwork(network) || handle.length < LEAD_HANDLE_MIN)) redirect(`${back}?amb=missing#etape`);
  const fresh = await saveLead({
    userId: user.id, program, interested,
    network: interested ? network : '', handle: interested ? handle : '', schools: interested ? schools : '',
  });
  if (fresh && interested) {
    const link = leadLink(network, handle);
    await sendOutreachAlert({
      subject: `Ambassadeur : ${cert.holder_name} veut devenir ambassadeur`,
      lines: [
        `${cert.holder_name} (${user.email}) vient d’obtenir son certificat et veut devenir ambassadeur.`,
        `${leadNetworkLabel(network)} : ${handle}${link && link !== handle ? `\n${link}` : ''}`,
        schools ? `Écoles citées : ${schools}` : '',
        `Note donnée à la formation : ${cert.rating}/5`,
        'À retrouver dans l’admin, onglet Prospection, tableau « Certifiés intéressés ».',
      ].filter(Boolean),
      linkedin: network === 'linkedin' && link ? link : undefined,
    }).catch(() => {});
  }
  redirect(back);
}
