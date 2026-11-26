'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { trustpilotEventAction } from '@/lib/learnActions';

// Secondes entre le clic Trustpilot et la suite du parcours (23/11). Le décompte n'est plus affiché (26/11, demande de
// Pierre) : la suite arrive d'elle-même au bout de ce délai.
const WAIT = 20;

type Texts = { title: string; button: string; copyBtn: string; copied: string; thanks: string; next: string };

// Étape Trustpilot (5 étoiles) : l'élève copie l'avis qu'il vient d'écrire et le dépose sur Trustpilot.
// Compté (23/11) : l'écran vu, puis chaque clic sur le bouton, pour savoir combien d'élèves vont vraiment sur Trustpilot.
// Depuis le 24/11 l'étape précède le certificat : à la fin du décompte, la page est relue auprès du serveur, qui
// affiche l'étape suivante (question ambassadeur, puis certificat). Rien de la suite n'est dans la page avant cela.
export default function CertifyFinish({ t, domain, comment, program }: { t: Texts; domain: string; comment: string; program: string }) {
  const router = useRouter();
  const [left, setLeft] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const url = `https://www.trustpilot.com/evaluate/${domain}`;
  const hasComment = comment.trim().length > 0;
  const preview = comment.trim().length > 110 ? comment.trim().slice(0, 110).replace(/\s+\S*$/, '') + '…' : comment.trim();
  useEffect(() => {
    if (left === null || left <= 0) return;
    const id = setTimeout(() => setLeft((n) => (n === null ? null : n - 1)), 1000);
    return () => clearTimeout(id);
  }, [left]);
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);
  const note = (event: 'shown' | 'click' | 'done') => {
    const fd = new FormData();
    fd.set('program', program);
    fd.set('event', event);
    return trustpilotEventAction(fd).catch(() => {});
  };
  const seen = useRef(false);
  useEffect(() => {
    if (seen.current) return;
    seen.current = true;
    note('shown');
  });
  const done = left === 0;
  // Décompte terminé : l'étape est notée comme passée, puis le serveur rend la suite.
  const moved = useRef(false);
  useEffect(() => {
    if (!done || moved.current) return;
    moved.current = true;
    note('done').then(() => router.refresh());
  });
  // Le bouton de secours n'apparaît que si la page ne s'est pas relue toute seule au bout de quelques secondes.
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    if (!done) return;
    const id = setTimeout(() => setStuck(true), 4000);
    return () => clearTimeout(id);
  }, [done]);
  const onGo = () => {
    note('click');
    if (hasComment) {
      navigator.clipboard?.writeText(comment).then(() => {
        setCopied(true);
        if (copyTimer.current) clearTimeout(copyTimer.current);
        copyTimer.current = setTimeout(() => setCopied(false), 4000);
      }).catch(() => {});
    }
    if (left === null) setLeft(WAIT);
  };
  if (done) {
    return (
      <div className="tp-ok">
        {t.thanks}
        {stuck && <button type="button" className="tp-next" onClick={() => window.location.reload()}>{t.next}</button>}
      </div>
    );
  }
  return (
    <section className="tp-card">
      <img className="tp-dog" src="/assets/trustpilot-dog.png" alt="" width={130} height={142} />
      <h2>{t.title}</h2>
      {hasComment && (
        <blockquote className="tp-quote">
          <span className="tp-quote-mark" aria-hidden="true">&ldquo;</span>
          {preview}
        </blockquote>
      )}
      <a className="tp-btn" href={url} target="_blank" rel="noreferrer" onClick={onGo}>
        {hasComment ? t.copyBtn : t.button}
      </a>
      {copied && <p className="tp-copied" role="status">✓ {t.copied}</p>}
    </section>
  );
}
