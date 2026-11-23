import Link from 'next/link';
import { daysFor, pace, planDays } from '@/lib/i18n/pace';
import type { Locale } from '@/lib/locales';
import s from './Pace.module.css';

// Le rythme conseillé (23/11) : « au moins 2 modules par jour ». Trois blocs, sans état, dans le style de l'espace élève.

/** Après le paiement : le plan jour par jour. */
export function PacePlan({ locale, modules }: { locale: Locale; modules: number }) {
  const p = pace(locale);
  return (
    <section className={s.plan} aria-label={p.planTitle}>
      <div>
        <span className={s.accent} aria-hidden="true" />
        <span className={s.kicker}>{p.planTitle}</span>
        <h2>{p.certIn(daysFor(modules))}</h2>
        <p className={s.lead}>{p.tipShort}</p>
      </div>
      <img className={s.mascot} src="/assets/course/certified.webp" alt="" width={120} height={126} />
      <ol className={s.days}>
        {planDays(modules).map((d) => (
          <li key={d.day} className={s.dayRow}>
            <span className={s.dayNum} aria-hidden="true">{d.day}</span>
            <span className={s.dayBody}>
              <span className={s.dayLabel}>{p.day(d.day)}</span>
              {d.modules.map((n) => <span key={n} className={s.pill}>{p.moduleLabel(n)}</span>)}
              {d.exam && <span className={`${s.pill} ${s.pillExam}`}><span className={s.star} aria-hidden="true">★</span>{p.examLabel}</span>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** En haut de l'espace : l'objectif d'aujourd'hui, en segments dorés comme la barre de progression. */
export function PaceGoal({ locale, goal, done, reached, examNext, modules }: {
  locale: Locale; goal: number; done: number; reached: boolean; examNext: boolean; modules: number;
}) {
  const p = pace(locale);
  if (examNext) {
    return (
      <div className={s.goal}>
        <div className={s.goalHead}><span className={s.kicker}>{p.goalKicker}</span></div>
        <span className={`${s.pill} ${s.pillExam}`}><span className={s.star} aria-hidden="true">★</span>{p.examLabel}</span>
      </div>
    );
  }
  return (
    <div className={s.goal}>
      <div className={s.goalHead}>
        <span className={s.kicker}>{p.goalKicker}</span>
        {reached ? <span className={s.badge}>✓ {p.reachedBadge}</span> : <span className={s.goalCount}>{p.goalShort(done, goal)}</span>}
      </div>
      <div className={s.segments} role="img" aria-label={p.goalCount(done, goal)}>
        {Array.from({ length: goal }, (_, i) => <span key={i} className={`${s.segment}${i < done ? ` ${s.segmentOn}` : ''}`} />)}
      </div>
      <p className={s.goalHint}>{reached ? p.goalReached : p.tip(daysFor(modules))}</p>
    </div>
  );
}

/** À la fin d'un module : enchaîner le suivant (ou l'examen), sur une carte bleu nuit avec Kai. */
export function PaceNext({ locale, href, label, modulesLeft, toExam }: {
  locale: Locale; href: string; label: string; modulesLeft: number; toExam: boolean;
}) {
  const p = pace(locale);
  return (
    <section className={s.next}>
      <div>
        <span className={s.nextKicker}><span aria-hidden="true">★</span>{p.moduleDone}</span>
        <h2>{toExam ? p.examTitle : p.nextTitle}</h2>
        <p>{toExam ? p.chainExam : p.chain(daysFor(modulesLeft))}</p>
      </div>
      <img className={s.nextMascot} src={toExam ? '/assets/course/certified.webp' : '/assets/course/exam.webp'} alt="" width={150} height={160} />
      <Link className={s.cta} href={href}>
        <svg width="16" height="18" viewBox="0 0 18 20" aria-hidden="true"><path d="M2 1.5v17l15-8.5z" fill="currentColor" /></svg>
        <span>{label}</span>
      </Link>
    </section>
  );
}
