// Widgets animés du cours étudiant v2 (23/11). Chaque leçon a :
//  - des widgets « étape par étape », insérés dans le texte juste après le bloc qu'ils illustrent (after = n° du bloc
//    dans lesson.body, identique en français et en anglais) ;
//  - l'histoire complète, en récapitulatif à la fin de la leçon : un petit film vertical (4:5) où la caméra suit
//    chaque étape en gros plan, puis dézoome sur tout le schéma.
// Ce sont des vidéos H.264 précalculées (60 i/s, lues par la puce vidéo : fluides sur téléphone, identiques partout),
// avec leur affiche (1re image) et leur image fixe (dernière image) dans public/images/course/v2/.
// Le cours v2 n'existe qu'en français et en anglais : toute autre langue que fr reçoit l'anglais (suffixe -en).
// w, h : taille de dessin du widget, en px CSS (la vidéo est au double).

export type FigureMedia = { video: string; poster: string; still: string; w: number; h: number };

const WIDGETS: Record<string, { k: string; after: number; w: number; h: number }[]> = {
  'v2-m1-l1': [{ k: 'a', after: 4, w: 418, h: 560 }, { k: 'b', after: 6, w: 388, h: 528 }, { k: 'c', after: 8, w: 388, h: 560 }],
  'v2-m1-l2': [{ k: 'a', after: 4, w: 364, h: 570 }, { k: 'b', after: 5, w: 286, h: 506 }, { k: 'c', after: 7, w: 536, h: 404 }, { k: 'd', after: 10, w: 536, h: 176 }],
  'v2-m1-l3': [{ k: 'a', after: 4, w: 606, h: 558 }, { k: 'b', after: 6, w: 576, h: 390 }, { k: 'c', after: 11, w: 576, h: 172 }],
  'v2-m2-l1': [{ k: 'a', after: 0, w: 560, h: 372 }, { k: 'b', after: 6, w: 308, h: 318 }, { k: 'c', after: 11, w: 420, h: 616 }],
  'v2-m2-l2': [{ k: 'a', after: 2, w: 282, h: 556 }, { k: 'b', after: 3, w: 282, h: 556 }, { k: 'c', after: 4, w: 282, h: 556 }, { k: 'd', after: 5, w: 326, h: 556 }],
  'v2-m3-l1': [{ k: 'a', after: 2, w: 400, h: 596 }, { k: 'b', after: 5, w: 470, h: 420 }, { k: 'c', after: 10, w: 500, h: 586 }],
  'v2-m3-l2': [{ k: 'a', after: 8, w: 560, h: 930 }],
  'v2-m3-l3': [{ k: 'a', after: 5, w: 404, h: 592 }, { k: 'b', after: 9, w: 404, h: 592 }, { k: 'c', after: 12, w: 398, h: 592 }],
  'v2-m4-l1': [{ k: 'a', after: 5, w: 610, h: 604 }, { k: 'b', after: 10, w: 560, h: 280 }, { k: 'c', after: 12, w: 560, h: 440 }],
};

const media = (name: string, locale: string | undefined, w: number, h: number): FigureMedia => {
  const base = `/images/course/v2/${name}${locale !== undefined && locale !== 'fr' ? '-en' : ''}`;
  return { video: `${base}.mp4`, poster: `${base}-start.webp`, still: `${base}.webp`, w, h };
};

/** Les widgets d'une leçon, avec le bloc du texte après lequel chacun s'affiche. */
export function lessonWidgets(lessonId: string, locale?: string): { after: number; media: FigureMedia }[] {
  return (WIDGETS[lessonId] ?? []).map((x) => ({ after: x.after, media: media(`${lessonId}-${x.k}`, locale, x.w, x.h) }));
}

/** L'histoire complète d'une leçon (récapitulatif de fin de leçon), ou null. */
export function lessonStory(lessonId: string, locale?: string): FigureMedia | null {
  return WIDGETS[lessonId] ? media(lessonId, locale, 864, 1080) : null;
}
