import type { Locale } from '../locales';
import type { Course, Question } from './types';
import studentAiEn from './student-ai/en';
import studentAiFr from './student-ai/fr';
import studentAiEs from './student-ai/es';
import studentAiIt from './student-ai/it';
import studentAiDe from './student-ai/de';
import studentAiV2Fr from './student-ai-v2/fr';
import studentAiV2En from './student-ai-v2/en';
import chatgpt from './catalog/chatgpt';
import claude from './catalog/claude';
import gemini from './catalog/gemini';
import microsoftCopilot from './catalog/microsoft-copilot';
import promptEngineering from './catalog/prompt-engineering';
import aiResearch from './catalog/ai-research';
import aiImages from './catalog/ai-images';
import aiVideo from './catalog/ai-video';
import aiAutomation from './catalog/ai-automation';
import aiAgents from './catalog/ai-agents';
import aiData from './catalog/ai-data';
import aiCoding from './catalog/ai-coding';
import responsibleAi from './catalog/responsible-ai';

export * from './types';

// Full courses, by programme then language. A programme without an entry here keeps the simple lesson list.
// Catalogue certifications are written in English, the language of the catalogue: every locale gets the same course.
const englishOnly = (course: Course): Record<Locale, Course> => ({ 'en-us': course, 'en-ca': course, fr: course, es: course, it: course, de: course });

const COURSES: Record<string, Record<Locale, Course>> = {
  'student-ai': { 'en-us': studentAiEn, 'en-ca': studentAiEn, fr: studentAiFr, es: studentAiEs, it: studentAiIt, de: studentAiDe },
  chatgpt: englishOnly(chatgpt),
  claude: englishOnly(claude),
  gemini: englishOnly(gemini),
  'microsoft-copilot': englishOnly(microsoftCopilot),
  'prompt-engineering': englishOnly(promptEngineering),
  'ai-research': englishOnly(aiResearch),
  'ai-images': englishOnly(aiImages),
  'ai-video': englishOnly(aiVideo),
  'ai-automation': englishOnly(aiAutomation),
  'ai-agents': englishOnly(aiAgents),
  'ai-data': englishOnly(aiData),
  'ai-coding': englishOnly(aiCoding),
  'responsible-ai': englishOnly(responsibleAi),
};

// Every language must have the same modules, lessons, ids and correct answers as the English reference,
// so a learner can switch language without changing progress or results.
function shape(c: Course) {
  const qs = (list: Question[]) => list.map((q) => `${q.options.length}:${q.answer}`).join(',');
  return JSON.stringify({
    program: c.program,
    modules: c.modules.map((m) => ({ id: m.id, lessons: m.lessons.map((l) => l.id), exercise: m.exercise.id, quiz: qs(m.quiz) })),
    exam: qs(c.exam),
  });
}

// New versions of a programme (v2 of the student course, 16/11): written language by language. A locale without
// the new version keeps the previous one; a learner who already started a version keeps it (lib/learning/progress).
const NEXT_VERSIONS: Record<string, Partial<Record<Locale, Course>>> = {
  'student-ai': { fr: studentAiV2Fr, 'en-us': studentAiV2En, 'en-ca': studentAiV2En },
};

/**
 * Quality checks of a strict course (16/11: in v1, 91 % of correct answers were the longest option, and almost all
 * were A or B, so the exam could be passed without the course). Fails the build when:
 *  - the correct answer is the longest option in more than 30 % of the questions;
 *  - one position holds more than 35 % of the correct answers (positions are also shuffled on display);
 *  - an option is more than 1.6 times the average length of its question's options.
 */
export function qualityProblems(course: Course): string[] {
  const all = [...course.modules.flatMap((m) => m.quiz), ...course.exam];
  const problems: string[] = [];
  let longest = 0;
  const positions = new Map<number, number>();
  for (const q of all) {
    const lens = q.options.map((o) => o.length);
    const max = Math.max(...lens);
    if (lens[q.answer] === max && lens.filter((l) => l === max).length === 1) longest++;
    positions.set(q.answer, (positions.get(q.answer) ?? 0) + 1);
    const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
    lens.forEach((l, i) => {
      if (l > 1.6 * mean) problems.push(`option ${i} too long in "${q.q.slice(0, 60)}"`);
    });
  }
  if (all.length && longest / all.length > 0.3) problems.push(`correct answer is the longest in ${Math.round((100 * longest) / all.length)} % of questions`);
  for (const [p, n] of positions) {
    if (all.length >= 20 && n / all.length > 0.35) problems.push(`position ${p} holds ${Math.round((100 * n) / all.length)} % of correct answers`);
  }
  return problems;
}

function check(program: string, byLocale: Partial<Record<Locale, Course>>, reference: string) {
  for (const [locale, course] of Object.entries(byLocale)) {
    if (!course) continue;
    if (shape(course) !== reference) throw new Error(`Course ${program} v${course.version ?? 1} (${locale}) does not match the reference version`);
    for (const q of [...course.modules.flatMap((m) => m.quiz), ...course.exam]) {
      if (q.answer < 0 || q.answer >= q.options.length) throw new Error(`Course ${program} (${locale}): bad answer in "${q.q}"`);
    }
    if (course.strict) {
      const problems = qualityProblems(course);
      if (problems.length) throw new Error(`Course ${program} v${course.version ?? 1} (${locale}) fails quality checks: ${problems.slice(0, 5).join('; ')}`);
    }
  }
}

for (const [program, byLocale] of Object.entries(COURSES)) check(program, byLocale, shape(byLocale['en-us']));
for (const [program, byLocale] of Object.entries(NEXT_VERSIONS)) {
  const ref = byLocale['en-us'] ?? Object.values(byLocale)[0];
  if (ref) check(program, byLocale, shape(ref));
}

/** A catalogue certification can be bought only once its course is written (the AI one is the student course). */
export function isAvailable(slug: string) {
  return slug === 'ai-at-work' || slug in COURSES;
}

/** Programmes that have a full course, in the order of the catalogue. */
export const COURSE_PROGRAMS = Object.keys(COURSES);

export function hasCourse(program: string) {
  return program in COURSES;
}

/** The course of a programme in a language: the latest version written in that language, or `version` when given
 * (a learner who started an earlier version keeps it). */
export function getCourse(program: string, locale: Locale, version?: number): Course | null {
  const next = NEXT_VERSIONS[program]?.[locale] ?? null;
  if (version === 1) return COURSES[program]?.[locale] ?? null;
  if (version && version > 1) return next && (next.version ?? 2) === version ? next : null;
  return next ?? COURSES[program]?.[locale] ?? null;
}

/** The first version of a programme (what learners who started before the new version keep). */
export function firstVersion(program: string, locale: Locale): Course | null {
  return COURSES[program]?.[locale] ?? null;
}

export function lessonIdsOf(course: Course) {
  return course.modules.flatMap((m) => m.lessons.map((l) => l.id));
}

/** Option order shown to one learner for one question: stable for them, different between learners. */
export function shuffledOrder(seed: string, length: number): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const next = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
  const order = Array.from({ length }, (_, i) => i);
  for (let i = length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/** Questions asked in a final exam: at most 30, drawn from the course's question bank for this learner and attempt
 * (a new draw at each attempt), kept in the bank's order. Returns their indexes in the bank. */
export const EXAM_QUESTIONS = 30;
export function examDraw(bankSize: number, seed: string, count = EXAM_QUESTIONS): number[] {
  if (bankSize <= count) return Array.from({ length: bankSize }, (_, i) => i);
  return shuffledOrder(seed, bankSize).slice(0, count).sort((a, b) => a - b);
}
