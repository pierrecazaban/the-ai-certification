// Ambassador grades (19/11). Beginner at the start (key 'dog', on purpose the least flattering), Intermediate once you brought
// someone (an ambassador invited with your link, or a Smart Mail ambassador who entered your code), Advanced from
// ADVANCED_AT people, and Master only when a Master names you. Pierre et Hippolyte (the admin) are Master.
export type Grade = 'dog' | 'intermediate' | 'advanced' | 'master';

export const ADVANCED_AT = 5;

export const GRADE_LABEL: Record<Grade, string> = {
  dog: 'Beginner', // « Dog » renamed Beginner (19/11); the key stays 'dog' in code and data
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  master: 'Legend', // « Master » renamed Legend (19/11); the key stays 'master' in code and data
};

export function gradeOf(p: { admin?: boolean; master?: boolean; brought: number }): Grade {
  if (p.admin || p.master) return 'master';
  if (p.brought >= ADVANCED_AT) return 'advanced';
  if (p.brought >= 1) return 'intermediate';
  return 'dog';
}

/** How each rank is reached, for the ranks panel (tap a badge in the pyramid). */
export const GRADE_RULE: Record<Grade, string> = {
  master: 'Only a Legend can make you a Legend.',
  advanced: `You brought ${ADVANCED_AT} people or more.`,
  intermediate: 'You brought one person: an ambassador with your link, or a Smart Mail ambassador with your code.',
  dog: 'Where everyone starts. Bring someone to get out of it.',
};

/** The way up from a grade, in a line. */
export function nextStep(grade: Grade, brought: number): string {
  if (grade === 'dog') return 'Bring one person to stop being a Beginner and become Intermediate.';
  if (grade === 'intermediate') return `Bring ${ADVANCED_AT - brought} more to become Advanced.`;
  if (grade === 'advanced') return 'Legend: only a Legend can make you one.';
  return 'Tap someone of your branch in the pyramid to make them a Legend.';
}
