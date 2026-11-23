import 'server-only';
import { sql } from '../db';
import { PER_DAY } from '../i18n/pace';
import { QUIZ_PASS } from './index';
import type { Progress } from './progress';

// Objectif du jour (23/11) : combien de modules l'étudiant a terminés aujourd'hui, dans le fuseau de son école.
// Un module est terminé au moment où sa dernière pièce l'est : dernière leçon cochée, exercice rendu ou quiz réussi.

const FALLBACK_TZ: Record<string, string> = { 'en-us': 'America/New_York', 'en-ca': 'America/Toronto' };

async function timezoneOf(userId: string, locale: string): Promise<string> {
  try {
    const [r] = await sql(
      `select u.timezone from registrations r join universities u on u.id = r.university_id
       where r.user_id = $1 and u.timezone <> '' order by r.created_at desc limit 1`, [userId]);
    if (r?.timezone) return String(r.timezone);
  } catch {}
  return FALLBACK_TZ[locale] ?? 'Europe/Paris';
}

const dayKey = (d: Date, timeZone: string) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

export type DailyGoal = { goal: number; done: number; reached: boolean; examNext: boolean };

export async function dailyGoal(userId: string, progress: Progress): Promise<DailyGoal | null> {
  if (progress.certificate) return null;
  const program = progress.course.program;
  const remaining = progress.modules.filter((m) => !m.complete).length;
  if (remaining === 0) return { goal: 0, done: 0, reached: false, examNext: true };
  try {
    const [lessons, exercises, quizzes, tz] = await Promise.all([
      sql('select lesson_id, completed_at from lesson_progress where user_id = $1', [userId]),
      sql('select exercise_id, submitted_at from exercise_submissions where user_id = $1 and program = $2', [userId, program]),
      sql('select module_id, min(created_at) as at from quiz_attempts where user_id = $1 and program = $2 and score >= $3 group by module_id', [userId, program, QUIZ_PASS]),
      timezoneOf(userId, progress.locale),
    ]);
    const lessonAt = new Map(lessons.map((r) => [String(r.lesson_id), new Date(r.completed_at)]));
    const exerciseAt = new Map(exercises.map((r) => [String(r.exercise_id), new Date(r.submitted_at)]));
    const quizAt = new Map(quizzes.map((r) => [String(r.module_id), new Date(r.at)]));
    const today = dayKey(new Date(), tz);
    let done = 0;
    progress.course.modules.forEach((m, i) => {
      if (!progress.modules[i].complete) return;
      const times = [...m.lessons.map((l) => lessonAt.get(l.id)), exerciseAt.get(m.exercise.id), quizAt.get(m.id)].filter((d): d is Date => Boolean(d));
      if (!times.length) return;
      const finished = new Date(Math.max(...times.map((d) => d.getTime())));
      if (dayKey(finished, tz) === today) done++;
    });
    const goal = Math.min(PER_DAY, remaining + done);
    return { goal, done, reached: done >= goal, examNext: false };
  } catch {
    return null; // l'objectif ne doit jamais empêcher l'espace de s'afficher
  }
}
