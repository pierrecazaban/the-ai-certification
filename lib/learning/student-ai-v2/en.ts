import type { Course } from '../types';
import { exam } from './en-exam';
import { extras } from './en-extras';
import { modules } from './en-modules';

// Student course, version 2 (16/11). Same title as v1: the certificate keeps its name.
const en: Course = {
  program: 'student-ai',
  title: 'AI at work',
  version: 2,
  examPass: 0.75,
  examQuestions: 40,
  strict: true,
  // Vidéos et glossaire de chaque module (24/11) : en-extras.ts.
  modules: modules.map((m) => ({ ...m, ...extras[m.id] })),
  exam,
};

export default en;
