import type { Locale } from '../locales';

// Le rythme conseillé aux étudiants (23/11) : au moins 2 modules par jour, pour avoir son certificat en quelques jours
// au lieu de laisser le cours en plan. Montré après le paiement (page et mail), en haut de l'espace et à la fin de
// chaque module.
export const PER_DAY = 2;

type Pace = {
  tip: (days: number) => string;
  planTitle: string;
  day: (d: number) => string;
  modules: (list: number[]) => string;
  thenExam: string;
  goal: (goal: number) => string;
  goalCount: (done: number, goal: number) => string;
  goalReached: string;
  goalExam: string;
  moduleDone: string;
  chain: (days: number) => string;
  chainExam: string;
  certIn: (days: number) => string;
  tipShort: string;
  moduleLabel: (n: number) => string;
  examLabel: string;
  goalKicker: string;
  goalShort: (done: number, goal: number) => string;
  reachedBadge: string;
  nextTitle: string;
  examTitle: string;
};

const join = (list: number[], and: string) => (list.length < 2 ? String(list[0]) : `${list.slice(0, -1).join(', ')} ${and} ${list[list.length - 1]}`);

const en: Pace = {
  certIn: (days) => `Your certificate in ${days} day${days > 1 ? 's' : ''}`,
  tipShort: `We strongly recommend doing at least ${PER_DAY} modules a day.`,
  moduleLabel: (n) => `Module ${n}`,
  examLabel: 'Exam',
  goalKicker: 'Today’s goal',
  goalShort: (done, goal) => `${Math.min(done, goal)}/${goal} modules`,
  reachedBadge: 'Goal reached',
  nextTitle: 'On to the next module',
  examTitle: 'On to the final exam',
  tip: (days) => `We strongly recommend doing at least ${PER_DAY} modules a day: your certificate in ${days} day${days > 1 ? 's' : ''}.`,
  planTitle: 'Your plan',
  day: (d) => `Day ${d}`,
  modules: (list) => `${list.length > 1 ? 'modules' : 'module'} ${join(list, 'and')}`,
  thenExam: 'then the exam',
  goal: (goal) => `Today’s goal: ${goal} module${goal > 1 ? 's' : ''}`,
  goalCount: (done, goal) => `${Math.min(done, goal)} of ${goal} done`,
  goalReached: 'Keep going if you can: the sooner you finish, the sooner it is on LinkedIn.',
  goalExam: 'Today’s goal: the final exam',
  moduleDone: 'Module complete!',
  chain: (days) => `We strongly recommend starting the next one right now: ${PER_DAY} modules a day means your certificate in ${days} day${days > 1 ? 's' : ''}.`,
  chainExam: 'Last module done! Take the exam now, while everything is fresh.',
};

const fr: Pace = {
  certIn: (days) => `Ton certificat en ${days} jour${days > 1 ? 's' : ''}`,
  tipShort: `On te conseille fortement de faire au moins ${PER_DAY} modules par jour.`,
  moduleLabel: (n) => `Module ${n}`,
  examLabel: 'Examen',
  goalKicker: 'Objectif du jour',
  goalShort: (done, goal) => `${Math.min(done, goal)}/${goal} modules`,
  reachedBadge: 'Objectif atteint',
  nextTitle: 'Enchaîne le module suivant',
  examTitle: 'Place à l’examen final',
  tip: (days) => `On te conseille fortement de faire au moins ${PER_DAY} modules par jour : ton certificat en ${days} jour${days > 1 ? 's' : ''}.`,
  planTitle: 'Ton plan',
  day: (d) => `Jour ${d}`,
  modules: (list) => `${list.length > 1 ? 'modules' : 'module'} ${join(list, 'et')}`,
  thenExam: 'puis l’examen',
  goal: (goal) => `Objectif d’aujourd’hui : ${goal} module${goal > 1 ? 's' : ''}`,
  goalCount: (done, goal) => `${Math.min(done, goal)} sur ${goal} fait${Math.min(done, goal) > 1 ? 's' : ''}`,
  goalReached: 'Continue si tu peux : plus tôt tu finis, plus tôt il est sur LinkedIn.',
  goalExam: 'Objectif d’aujourd’hui : l’examen final',
  moduleDone: 'Module terminé !',
  chain: (days) => `On te conseille fortement d’enchaîner le suivant maintenant : ${PER_DAY} modules par jour, c’est ton certificat en ${days} jour${days > 1 ? 's' : ''}.`,
  chainExam: 'Dernier module terminé ! Passe l’examen maintenant, tant que tout est frais.',
};

const es: Pace = {
  certIn: (days) => `Tu certificado en ${days} día${days > 1 ? 's' : ''}`,
  tipShort: `Te recomendamos encarecidamente hacer al menos ${PER_DAY} módulos al día.`,
  moduleLabel: (n) => `Módulo ${n}`,
  examLabel: 'Examen',
  goalKicker: 'Objetivo de hoy',
  goalShort: (done, goal) => `${Math.min(done, goal)}/${goal} módulos`,
  reachedBadge: 'Objetivo cumplido',
  nextTitle: 'Sigue con el siguiente módulo',
  examTitle: 'Ahora, el examen final',
  tip: (days) => `Te recomendamos encarecidamente hacer al menos ${PER_DAY} módulos al día: tu certificado en ${days} día${days > 1 ? 's' : ''}.`,
  planTitle: 'Tu plan',
  day: (d) => `Día ${d}`,
  modules: (list) => `${list.length > 1 ? 'módulos' : 'módulo'} ${join(list, 'y')}`,
  thenExam: 'y después el examen',
  goal: (goal) => `Objetivo de hoy: ${goal} módulo${goal > 1 ? 's' : ''}`,
  goalCount: (done, goal) => `${Math.min(done, goal)} de ${goal} hecho${Math.min(done, goal) > 1 ? 's' : ''}`,
  goalReached: 'Sigue si puedes: cuanto antes termines, antes estará en LinkedIn.',
  goalExam: 'Objetivo de hoy: el examen final',
  moduleDone: '¡Módulo terminado!',
  chain: (days) => `Te recomendamos encarecidamente empezar el siguiente ahora: ${PER_DAY} módulos al día son tu certificado en ${days} día${days > 1 ? 's' : ''}.`,
  chainExam: '¡Último módulo terminado! Haz el examen ahora, mientras todo está fresco.',
};

const it: Pace = {
  certIn: (days) => `Il tuo certificato in ${days} giorn${days > 1 ? 'i' : 'o'}`,
  tipShort: `Ti consigliamo vivamente di fare almeno ${PER_DAY} moduli al giorno.`,
  moduleLabel: (n) => `Modulo ${n}`,
  examLabel: 'Esame',
  goalKicker: 'Obiettivo di oggi',
  goalShort: (done, goal) => `${Math.min(done, goal)}/${goal} moduli`,
  reachedBadge: 'Obiettivo raggiunto',
  nextTitle: 'Passa al modulo successivo',
  examTitle: 'Ora l’esame finale',
  tip: (days) => `Ti consigliamo vivamente di fare almeno ${PER_DAY} moduli al giorno: il tuo certificato in ${days} giorn${days > 1 ? 'i' : 'o'}.`,
  planTitle: 'Il tuo piano',
  day: (d) => `Giorno ${d}`,
  modules: (list) => `${list.length > 1 ? 'moduli' : 'modulo'} ${join(list, 'e')}`,
  thenExam: 'poi l’esame',
  goal: (goal) => `Obiettivo di oggi: ${goal} modul${goal > 1 ? 'i' : 'o'}`,
  goalCount: (done, goal) => `${Math.min(done, goal)} su ${goal} fatt${Math.min(done, goal) > 1 ? 'i' : 'o'}`,
  goalReached: 'Continua se puoi: prima finisci, prima è su LinkedIn.',
  goalExam: 'Obiettivo di oggi: l’esame finale',
  moduleDone: 'Modulo completato!',
  chain: (days) => `Ti consigliamo vivamente di iniziare subito il prossimo: ${PER_DAY} moduli al giorno significano il tuo certificato in ${days} giorn${days > 1 ? 'i' : 'o'}.`,
  chainExam: 'Ultimo modulo completato! Fai l’esame adesso, finché è tutto fresco.',
};

const de: Pace = {
  certIn: (days) => `Dein Zertifikat in ${days} Tag${days > 1 ? 'en' : ''}`,
  tipShort: `Wir empfehlen dir dringend, mindestens ${PER_DAY} Module pro Tag zu machen.`,
  moduleLabel: (n) => `Modul ${n}`,
  examLabel: 'Prüfung',
  goalKicker: 'Ziel für heute',
  goalShort: (done, goal) => `${Math.min(done, goal)}/${goal} Module`,
  reachedBadge: 'Ziel erreicht',
  nextTitle: 'Weiter zum nächsten Modul',
  examTitle: 'Jetzt die Abschlussprüfung',
  tip: (days) => `Wir empfehlen dir dringend, mindestens ${PER_DAY} Module pro Tag zu machen: dein Zertifikat in ${days} Tag${days > 1 ? 'en' : ''}.`,
  planTitle: 'Dein Plan',
  day: (d) => `Tag ${d}`,
  modules: (list) => `${list.length > 1 ? 'Module' : 'Modul'} ${join(list, 'und')}`,
  thenExam: 'dann die Prüfung',
  goal: (goal) => `Ziel für heute: ${goal} Modul${goal > 1 ? 'e' : ''}`,
  goalCount: (done, goal) => `${Math.min(done, goal)} von ${goal} erledigt`,
  goalReached: 'Mach weiter, wenn du kannst: Je früher du fertig bist, desto früher steht es auf LinkedIn.',
  goalExam: 'Ziel für heute: die Abschlussprüfung',
  moduleDone: 'Modul abgeschlossen!',
  chain: (days) => `Wir empfehlen dir dringend, gleich mit dem nächsten weiterzumachen: ${PER_DAY} Module pro Tag heißt dein Zertifikat in ${days} Tag${days > 1 ? 'en' : ''}.`,
  chainExam: 'Letztes Modul geschafft! Mach jetzt die Prüfung, solange alles frisch ist.',
};

const BY: Record<string, Pace> = { en, fr, es, it, de };

export function pace(locale: Locale | string): Pace {
  return BY[String(locale).slice(0, 2)] ?? en;
}

/** Nombre de jours au rythme conseillé pour `modules` modules. */
export const daysFor = (modules: number) => Math.max(1, Math.ceil(modules / PER_DAY));

/** Le plan jour par jour : les modules de chaque jour, l'examen le dernier jour. */
export function planDays(modules: number): { day: number; modules: number[]; exam: boolean }[] {
  const days = daysFor(modules);
  return Array.from({ length: days }, (_, d) => ({
    day: d + 1,
    modules: Array.from({ length: modules }, (_, i) => i + 1).slice(d * PER_DAY, d * PER_DAY + PER_DAY),
    exam: d === days - 1,
  }));
}

/** Le même plan en phrases : [« Jour 1 », « modules 1 et 2 »], …, le dernier jour finit par l'examen. */
export function planLines(locale: Locale | string, modules: number): { day: string; what: string }[] {
  const p = pace(locale);
  return planDays(modules).map((d) => ({ day: p.day(d.day), what: `${p.modules(d.modules)}${d.exam ? `, ${p.thenExam}` : ''}` }));
}
