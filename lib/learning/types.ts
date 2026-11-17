// Structure of a full course. Every language version of a course has exactly the same shape and order,
// and the same `answer` index for each question (checked by lib/learning/index.ts at load).

/**
 * Lesson text, one string per block:
 *   "## Heading", "- bullet", "> tip or key idea", "! example or prompt to copy", anything else is a paragraph.
 */
export type Body = string[];

export type Question = {
  q: string;
  options: string[];
  answer: number; // index of the correct option; never sent to the browser
  why: string; // shown after the attempt
};

export type Lesson = { id: string; title: string; minutes: number; body: Body; /** Photo shown above the lesson. */ image?: string };

export type Exercise = {
  id: string;
  title: string;
  minutes: number;
  intro: string;
  steps: string[];
  /** What the learner pastes back to show the work (a prompt, an agent's instructions, a result…). */
  submission: string;
};

export type Module = {
  id: string;
  title: string;
  summary: string;
  lessons: Lesson[];
  exercise: Exercise;
  quiz: Question[];
};

export type Course = {
  program: string;
  title: string;
  modules: Module[];
  exam: Question[];
  /** Version of the course for this programme (1 when absent). A learner who started a version keeps it. */
  version?: number;
  /** Share of correct answers needed to pass the final exam (EXAM_PASS_RATIO when absent). */
  examPass?: number;
  /** Questions drawn from the exam bank at each attempt (EXAM_QUESTIONS when absent). */
  examQuestions?: number;
  /** Quality checks enforced at load: options of similar length, correct answers spread over positions. */
  strict?: boolean;
};

export const QUIZ_PASS = 4; // out of 5
export const EXAM_PASS_RATIO = 0.7; // 35 out of 50
export const EXAM_RETRY_MINUTES = 60;

// Illustrations that really exist in /public. The Kai drawings of public/assets/course (m1, m2, m3) are generic:
// any module (v2 or catalogue) gets one in turn. Lesson photos only exist for the v1 student lessons (m1-l1 … m3-l3);
// a lesson without one shows no photo rather than a broken image.
export function moduleArt(moduleId: string): string {
  const n = Number(/(\d+)$/.exec(moduleId)?.[1] ?? 1);
  return `/assets/course/m${((Math.max(n, 1) - 1) % 3) + 1}.webp`;
}
const LESSON_PHOTOS = new Set(['m1-l1', 'm1-l2', 'm1-l3', 'm2-l1', 'm2-l2', 'm2-l3', 'm3-l1', 'm3-l2', 'm3-l3']);
export function lessonPhoto(lesson: Lesson): string | null {
  return lesson.image ?? (LESSON_PHOTOS.has(lesson.id) ? `/images/course/${lesson.id}.webp` : null);
}
