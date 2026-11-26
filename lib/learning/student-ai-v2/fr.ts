import type { Course } from '../types';
import { exam } from './fr-exam';
import { extras } from './fr-extras';
import { modules } from './fr-modules';

// Formation étudiante, version 2 (16/11). Même titre que la v1 : le certificat garde son nom.
const fr: Course = {
  program: 'student-ai',
  title: 'L’IA au travail',
  version: 2,
  examPass: 0.75,
  examQuestions: 40,
  strict: true,
  // Vidéos et glossaire de chaque module (24/11) : fr-extras.ts.
  modules: modules.map((m) => ({ ...m, ...extras[m.id] })),
  exam,
};

export default fr;
