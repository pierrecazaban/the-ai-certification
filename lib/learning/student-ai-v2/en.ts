import type { Course } from '../types';
import { exam } from './en-exam';
import { modules } from './en-modules';

// Student course, version 2 (16/11). Same title as v1: the certificate keeps its name.
const en: Course = {
  program: 'student-ai',
  title: 'AI at work',
  version: 2,
  examPass: 0.75,
  examQuestions: 40,
  strict: true,
  modules,
  exam,
};

export default en;
