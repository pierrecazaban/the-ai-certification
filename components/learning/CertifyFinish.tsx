'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { trustpilotEventAction } from '@/lib/learnActions';

const WAIT = 20; // secondes entre le clic Trustpilot et le déblocage de LinkedIn (23/11).

type Texts = { title: string; button: string; copyBtn: string; copied: string; wait: string; thanks: string };

// Dernière étape (5 étoiles) : l'élève copie l'avis qu'il vient d'écrire et le dépose sur Trustpilot, avant LinkedIn.
// Compté (23/11) : l'écran vu, puis chaque clic sur le bouton, pour savoir combien d'élèves vont vraiment sur Trustpilot.
export default function CertifyFinish({ t, domain, comment, program, children }: { t: Texts; domain: string; comment: string; program: string; children: ReactNode }) {
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
  const note = (event: 'shown' | 'click') => {
    const fd = new FormData();
    fd.set('program', program);
    fd.set('event', event);
    trustpilotEventAction(fd).catch(() => {});
  };
  const seen = useRef(false);
  useEffect(() => {
    if (seen.current) return;
    seen.current = true;
    note('shown');
  });
  const done = left === 0;
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
  return (
    <>
      {!done && (
        <section className="tp-card no-print">
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
          {left && left > 0 ? <p className="tp-wait">{t.wait.replace('{s}', String(left))}</p> : null}
        </section>
      )}
      {done && <div className="tp-ok no-print">{t.thanks}</div>}
      <div className={done ? '' : 'tp-locked'} aria-hidden={!done}>{children}</div>
    </>
  );
}
