import type { LearnDict } from '@/lib/i18n/learn';
import type { ModuleVideo } from '@/lib/learning';
import { makeScenarioLegend, makeScenarioSvg } from '@/lib/learning/makeScenario';
import BookletViewer from './BookletViewer';
import css from './Extras.module.css';

// Aides d'un module (24/11), demandées après trois avis d'élèves : l'assistant du cours et le fascicule en haut de la
// page, deux vidéos après les leçons, et la reproduction de l'écran de Make dans l'exercice.
// Composants serveur, sans script : un bouton qui porte data-kai-open ouvre l'assistant (components/learning/Tutor).
// Les deux aides du haut reprennent trait pour trait les cartes de module de l'accueil de l'espace élève (.sp-module :
// tuile bleu pâle, pastille, titre, action à droite), pour rester dans le style du site.

const Chevron = () => (
  <svg className="sp-chev" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
);

/** Ce qu'il faut pour montrer le fascicule d'un module : son PDF, sa couverture et, depuis le 26/11, ses pages en images
 *  (lues dans la page du module, voir BookletViewer). */
export type BookletInfo = { href: string; cover: string; pageHref: string; pages: number; width: number; height: number; heading: string };

/** Sous la liste « Pour terminer ce module » : l'assistant (s'il est en service) et le fascicule PDF (s'il existe).
 *  booklet : le PDF, l'image de sa couverture (montrée comme un livret entrouvert) et ses pages, lues sur place. */
export function ModuleHelp({ l, kai, booklet }: { l: LearnDict; kai: boolean; booklet: BookletInfo | null }) {
  if (!kai && !booklet) return null;
  return (
    <div className={`sp-modules ${css.help}`}>
      {kai && (
        <button type="button" className={`sp-module ${css.row}`} data-kai-open>
          {/* Kai qui fait signe, avec sa bulle (illustration du site, sans rond autour). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={css.kaiArt} src="/assets/kai-question.webp" alt="" width={420} height={437} />
          <div className="sp-module-body">
            <span className="sp-kicker">{l.helpKicker}</span>
            <strong>{l.helpTitle}</strong>
            <span className="sp-summary">{l.helpText}</span>
          </div>
          <span className="sp-go"><span className="sp-go-text">{l.helpAsk}</span><Chevron /></span>
        </button>
      )}
      {booklet && (
        // Le fascicule s'ouvre dans la page du module (26/11) : on ne la perd pas et on y revient d'un geste.
        <BookletViewer pdf={booklet.href} cover={booklet.cover} pageHref={booklet.pageHref} pages={booklet.pages}
          width={booklet.width} height={booklet.height} heading={booklet.heading} kicker={l.bookletKicker} title={l.bookletTitle}
          text={l.bookletText} open={l.bookletOpen} back={l.bookletBack} download={l.bookletDownload} pageWord={l.bookletPage} />
      )}
    </div>
  );
}

/** Après les leçons : les deux vidéos du module, dans le lecteur de YouTube, prêtes à lancer (son bouton rouge).
 *  On ne copie pas les vidéos des autres : elles restent chez leurs auteurs. Les lecteurs ne se chargent qu'à
 *  l'approche de la section (loading="lazy"), donc la page s'affiche aussi vite qu'avant. */
export function ModuleVideosSection({ videos, lang, l }: { videos: ModuleVideo[]; lang: string; l: LearnDict }) {
  if (!videos.length) return null;
  return (
    <>
      <h2 className="learn-section" id="videos">{l.videosTitle}</h2>
      <div className={css.videos}>
        {videos.map((v) => (
          <article key={v.id} className={css.video}>
            <div className={css.player}>
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${v.id}?playsinline=1&rel=0&hl=${lang}`}
                title={v.title}
                loading="lazy"
                allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen; web-share"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
            <div className={css.videoBody}>
              <strong>{v.title}</strong>
              <span className={css.videoMeta}>{v.channel} · {l.minutes(v.minutes)}</span>
              <span>{v.why}</span>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

/** Dans l'exercice (modules 3 et 4 du cours v2) : le scénario à construire, tel qu'il apparaît dans Make. */
export function MakeScenario({ locale, variant, l, kai }: { locale: string; variant: 'exercise' | 'project'; l: LearnDict; kai: boolean }) {
  const lang = locale === 'fr' ? 'fr' : 'en';
  return (
    <figure className={css.make}>
      <h3>{l.makeTitle}</h3>
      <div className={css.screen}>
        {/* Deux mises en page du même écran : large, et resserrée pour le téléphone (textes lisibles sans zoomer). */}
        <div className={css.wide} dangerouslySetInnerHTML={{ __html: makeScenarioSvg(lang, false) }} />
        <div className={css.compact} dangerouslySetInnerHTML={{ __html: makeScenarioSvg(lang, true) }} />
      </div>
      <ol className={css.legend}>
        {makeScenarioLegend(lang, variant).map((line) => <li key={line}>{line}</li>)}
      </ol>
      <div className={css.makeFoot}>
        {kai && <button type="button" className="btn btn-sm btn-ghost" data-kai-open data-kai-prompt={l.makeStuckPrompt}>{l.makeStuck}</button>}
        <small>{l.makeNote}</small>
      </div>
    </figure>
  );
}
