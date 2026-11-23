'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { FigureMedia } from '@/lib/learning/figures';

// Widget animé d'une leçon (23/11) : une vidéo précalculée (fluide partout) qui démarre quand elle arrive à
// l'écran, se met en pause quand on la quitte et s'arrête sur sa dernière image. Un appui l'ouvre en grand dans
// la page, sur un fond flouté (jamais de redirection vers le fichier). Bouton « Rejouer » dans les deux vues.
// Avec « réduire les animations », sans IntersectionObserver ou si la lecture est refusée (mode économie
// d'énergie de l'iPhone) : l'image fixe, qui s'ouvre aussi en grand.
const TXT = {
  fr: { replay: 'Rejouer', open: 'Agrandir', close: 'Fermer' },
  en: { replay: 'Replay', open: 'Enlarge', close: 'Close' },
};

const IconReplay = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /><path d="M4 3.5V8h4.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const IconOpen = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const IconClose = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
);

function reducedMotion() {
  return typeof window === 'undefined' || !('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function LessonFigure({ media, locale, fill = false }: { media: FigureMedia; locale?: string; fill?: boolean }) {
  const t = locale === 'fr' ? TXT.fr : TXT.en;
  const box = useRef<HTMLDivElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
  const [still, setStill] = useState(false);
  const [ended, setEnded] = useState(false);
  const [big, setBig] = useState(false);

  useEffect(() => {
    if (reducedMotion()) { setStill(true); return; }
    const el = box.current, v = vid.current;
    if (!el || !v) return;
    const tryPlay = () => { if (!v.ended) v.play().catch(() => setStill(true)); };
    const near = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      v.preload = 'auto';
      near.disconnect();
    }, { rootMargin: '700px 0px' });
    const seen = new IntersectionObserver(([e]) => {
      if (e.intersectionRatio >= 0.45) tryPlay();
      else if (e.intersectionRatio < 0.15 && !v.paused) v.pause();
    }, { threshold: [0, 0.15, 0.45] });
    near.observe(el);
    seen.observe(el);
    return () => { near.disconnect(); seen.disconnect(); };
  }, []);

  const replay = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const v = vid.current;
    if (!v) return;
    v.currentTime = 0;
    setEnded(false);
    v.play().catch(() => setStill(true));
  };
  const open = () => { vid.current?.pause(); setBig(true); };
  // En revenant du plein écran, le widget reprend là où il en était (s'il n'avait pas fini).
  const close = useCallback(() => { setBig(false); const v = vid.current; if (v && !v.ended && v.currentTime > 0) v.play().catch(() => {}); }, []);

  const style = { '--fw': `${media.w}px`, '--ar': `${media.w / media.h}` } as React.CSSProperties;
  return (
    <div className={`lf-wrap${fill ? ' lf-fill' : ''}`} style={style}>
      <div ref={box} className="lf" role="button" tabIndex={0} aria-label={t.open}
        onClick={open} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}>
        {still ? (
          <img src={media.still} alt="" width={media.w} height={media.h} loading="lazy" />
        ) : (
          <video ref={vid} muted playsInline preload="none" poster={media.poster} width={media.w} height={media.h}
            onEnded={() => setEnded(true)} onPlay={() => setEnded(false)}>
            <source src={media.video} type="video/mp4" />
          </video>
        )}
      </div>
      <div className="lf-bar">
        {!still && (
          <button type="button" className={`lf-btn${ended ? ' is-on' : ''}`} onClick={replay}><IconReplay />{t.replay}</button>
        )}
        <button type="button" className="lf-btn" onClick={open}><IconOpen />{t.open}</button>
      </div>
      {big && <Lightbox media={media} still={still} t={t} onClose={close} />}
    </div>
  );
}

function Lightbox({ media, still, t, onClose }: { media: FigureMedia; still: boolean; t: typeof TXT.fr; onClose: () => void }) {
  const vid = useRef<HTMLVideoElement>(null);
  const [ended, setEnded] = useState(false);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    vid.current?.play().catch(() => {});
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', key); };
  }, [onClose]);
  const replay = () => { const v = vid.current; if (!v) return; v.currentTime = 0; setEnded(false); v.play().catch(() => {}); };
  return createPortal(
    <div className="lf-box" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="lf-box-inner" style={{ '--ar': `${media.w / media.h}` } as React.CSSProperties} onClick={(e) => e.stopPropagation()}>
        {still ? (
          <img src={media.still} alt="" width={media.w} height={media.h} />
        ) : (
          <video ref={vid} muted playsInline autoPlay preload="auto" poster={media.poster} width={media.w} height={media.h} onEnded={() => setEnded(true)}>
            <source src={media.video} type="video/mp4" />
          </video>
        )}
        <div className="lf-box-bar">
          {!still && (
            <button type="button" className={`lf-pill${ended ? ' is-on' : ''}`} onClick={replay}><IconReplay />{t.replay}</button>
          )}
          <button type="button" className="lf-pill" onClick={onClose}><IconClose />{t.close}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
