import type { Course } from './types';
import { BOOKLET_PAGES } from './booklet-pages';

// Fascicules des modules (24/11) : un PDF par module du cours étudiant v2, en français et en anglais, générés par
// scripts/fascicules.mjs dans fascicules/<langue>/<module>.pdf (hors de public/ : réservés aux élèves connectés,
// servis par app/space/[program]/module/[id]/fascicule/route.ts). Le même script écrit l'image de chaque couverture
// dans public/images/course/v2/ : c'est elle qu'on montre, entrouverte, sur la page du module.

/** Le fichier du fascicule d'un module (« fr/v2-m1.pdf »), ou null quand ce cours n'en a pas. */
export function bookletFile(course: Course, locale: string, moduleId: string): string | null {
  if (course.program !== 'student-ai' || (course.version ?? 1) !== 2) return null;
  if (!course.modules.some((m) => m.id === moduleId)) return null;
  return `${locale === 'fr' ? 'fr' : 'en'}/${moduleId}.pdf`;
}

/** L'image de la couverture du fascicule (publique : elle ne montre que le titre du module). */
export function bookletCover(locale: string, moduleId: string) {
  return `/images/course/v2/fascicule-${locale === 'fr' ? 'fr' : 'en'}-${moduleId}.jpg`;
}

/** Les pages du fascicule en images (26/11), pour le lire dans la page du module : leur nombre et leur taille, écrits par
 *  scripts/fascicules-pages.mjs. null quand les images n'existent pas (le lien ouvre alors le PDF, comme avant). */
export function bookletPages(locale: string, moduleId: string): { pages: number; width: number; height: number } | null {
  return BOOKLET_PAGES[`${locale === 'fr' ? 'fr' : 'en'}/${moduleId}`] ?? null;
}
