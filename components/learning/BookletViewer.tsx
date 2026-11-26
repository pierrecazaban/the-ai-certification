'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import extras from './Extras.module.css';
import css from './BookletViewer.module.css';

// Le fascicule se lit dans la page du module (26/11, demande de Pierre : « pour ne pas perdre la page et pouvoir
// revenir »). La carte ouvre, par-dessus la page, les pages du fascicule en images (le PDF dans une page web ne montre
// souvent que sa première page sur iPhone). L'adresse prend #fascicule : le geste « retour » du téléphone ou du
// navigateur referme la lecture au lieu de quitter le module, et la page reste à l'endroit exact où on l'a laissée.
// Sans script, ou sans images, la carte ouvre le PDF comme avant (nouvel onglet).

const HASH = '#fascicule';

type Props = {
  pdf: string;
  cover: string;
  pageHref: string;
  pages: number;
  width: number;
  height: number;
  heading: string;
  kicker: string;
  title: string;
  text: string;
  open: string;
  back: string;
  download: string;
  pageWord: string;
};

const Chevron = ({ left = false }: { left?: boolean }) => (
  <svg className={left ? undefined : 'sp-chev'} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={left ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
  </svg>
);

export default function BookletViewer(p: Props) {
  const [open, setOpen] = useState(false);
  const card = useRef<HTMLAnchorElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const pushed = useRef(false); // l'entrée #fascicule vient-elle de nous ? (sinon : adresse ouverte telle quelle)

  // L'adresse décide : #fascicule ouvert, sans dièse fermé. Suit aussi les gestes retour et avant.
  useEffect(() => {
    const sync = () => setOpen(p.pages > 0 && window.location.hash === HASH);
    sync();
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
    };
  }, [p.pages]);

  const close = useCallback(() => {
    if (pushed.current && window.location.hash === HASH) {
      pushed.current = false;
      window.history.back(); // retire #fascicule : popstate referme, la page du module n'a pas bougé
    } else {
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
      setOpen(false);
    }
  }, []);

  // Pendant la lecture : la page du dessous ne défile plus, Échap referme, la lecture a le focus (Tab mène au retour).
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = 'hidden';
    sheet.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => {
      root.style.overflow = before;
      window.removeEventListener('keydown', onKey);
      card.current?.focus({ preventScroll: true });
    };
  }, [open, close]);

  const show = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Pas d'images, ou clic pour ouvrir ailleurs (Cmd, Ctrl, clic du milieu) : le lien fait son travail habituel.
    if (!p.pages || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (window.location.hash !== HASH) {
      window.history.pushState(window.history.state, '', HASH);
      pushed.current = true;
    }
    setOpen(true);
  };

  return (
    <>
      <a ref={card} className={`sp-module ${extras.bookRow}`} href={p.pdf} target="_blank" rel="noopener" onClick={show} aria-haspopup="dialog">
        {/* Le fascicule entrouvert : sa vraie couverture, tournée sur sa reliure, et la première page derrière. */}
        <span className={extras.book} aria-hidden="true">
          <span className={extras.bookPage} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={extras.bookCover} src={p.cover} alt="" width={168} height={238} loading="lazy" />
        </span>
        <div className="sp-module-body">
          <span className="sp-kicker">{p.kicker}</span>
          <strong>{p.title}</strong>
          <span className="sp-summary">{p.text}</span>
        </div>
        <span className="sp-go"><span className="sp-go-text">{p.open}</span><Chevron /></span>
      </a>
      {open && createPortal(
        <div ref={sheet} tabIndex={-1} className={css.overlay} role="dialog" aria-modal="true" aria-label={p.heading}>
          <header className={css.bar}>
            <button type="button" className={css.back} onClick={close}>
              <Chevron left />
              <span>{p.back}</span>
            </button>
            <strong className={css.heading}>{p.heading}</strong>
            <a className={css.download} href={p.pdf} download>{p.download}</a>
          </header>
          <div className={css.pages}>
            {Array.from({ length: p.pages }, (_, i) => (
              <figure key={i} className={css.page}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`${p.pageHref}${i + 1}`} alt={`${p.pageWord} ${i + 1} / ${p.pages}`} width={p.width} height={p.height}
                  loading={i < 2 ? 'eager' : 'lazy'} decoding="async" />
              </figure>
            ))}
            <button type="button" className={css.end} onClick={close}>{p.back}</button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
