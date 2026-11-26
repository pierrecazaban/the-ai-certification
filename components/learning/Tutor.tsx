'use client';

import { useEffect, useRef, useState } from 'react';
import css from './Extras.module.css';

// Kai, l'assistant IA du cours (24/11) : un bouton flottant « Une question ? » sur chaque page de module, qui ouvre
// la discussion (une carte blanche du cours ; sur téléphone, elle monte du bas de l'écran). Il répond aux questions sur
// les modules : app/api/tutor reçoit le module ouvert et la conversation.
// Tout bouton de la page qui porte data-kai-open l'ouvre ; data-kai-prompt prépare le début de la question.
// La conversation reste le temps de la visite (sessionStorage), d'un module à l'autre.

type Message = { role: 'user' | 'assistant'; content: string };

export type TutorTexts = {
  launcher: string; role: string; hello: string; suggestions: string[]; placeholder: string;
  send: string; close: string; open: string; typing: string; error: string; limit: string; fine: string;
};

const KAI = '/assets/kai-question.webp'; // Kai qui fait signe, avec sa bulle (illustration fournie par Pierre, entière)
const KEEP = 30; // messages gardés et renvoyés au serveur

/** **gras**, `code` et liens à l'intérieur d'une ligne. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s)]+[^\s).,;!?]|\*\*[^*\n]+\*\*|`[^`\n]+`)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? <a key={i} href={p} target="_blank" rel="noopener noreferrer">{p.replace(/^https?:\/\/(www\.)?/, '')}</a>
          : /^\*\*[^*]+\*\*$/.test(p) ? <strong key={i}>{p.slice(2, -2)}</strong>
          : /^`[^`]+`$/.test(p) ? <code key={i}>{p.slice(1, -1)}</code>
          : <span key={i}>{p}</span>,
      )}
    </>
  );
}

/** Une réponse de Kai : paragraphes, listes à puces (« - ») et listes numérotées (« 1. »). */
function Answer({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push(<p key={out.length}><Inline text={para.join('\n')} /></p>);
    para = [];
    if (list) {
      const items = list.items.map((x, i) => <li key={i}><Inline text={x} /></li>);
      out.push(list.ordered ? <ol key={out.length}>{items}</ol> : <ul key={out.length}>{items}</ul>);
    }
    list = null;
  };
  for (const line of text.split('\n')) {
    const bullet = /^\s*[-•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (para.length || (list && list.ordered !== ordered)) flush();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
    } else if (!line.trim()) flush();
    else {
      if (list) flush();
      para.push(line);
    }
  }
  flush();
  return <div className={css.answer}>{out}</div>;
}

export default function Tutor({ program, moduleId, t }: { program: string; moduleId: string; t: TutorTexts }) {
  const store = `cfx_tutor_${program}`;
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const loaded = useRef(false);
  // Sur téléphone, le bouton flottant garde son libellé en haut de la page, puis se réduit à son icône.
  const [small, setSmall] = useState(false);
  useEffect(() => {
    const onScroll = () => setSmall(window.innerWidth <= 760 && window.scrollY > 260);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); };
  }, []);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(store);
      if (saved) setMessages(JSON.parse(saved));
    } catch {}
    loaded.current = true;
  }, [store]);
  useEffect(() => {
    if (!loaded.current) return;
    try {
      sessionStorage.setItem(store, JSON.stringify(messages.slice(-KEEP)));
    } catch {}
  }, [messages, store]);
  useEffect(() => {
    if (open && messages.length) threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [messages, open]);

  // Les boutons « Poser une question » et « Bloqué dans Make ? » de la page (rendus côté serveur).
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.('[data-kai-open]');
      if (!el) return;
      e.preventDefault();
      const prompt = el.getAttribute('data-kai-prompt');
      if (prompt) setInput(prompt);
      setOpen(true);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  // Ouvert : Échap ferme, la page derrière ne défile plus. Le champ prend le focus sur ordinateur, et sur téléphone
  // seulement si une question est déjà commencée (sinon le clavier cacherait le début de la discussion).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.documentElement.classList.add('chat-open');
    const timer = setTimeout(() => {
      const field = inputRef.current;
      if (!field) return;
      if (field.value || window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
        field.focus();
        field.setSelectionRange(field.value.length, field.value.length);
      }
    }, 150);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.documentElement.classList.remove('chat-open');
      clearTimeout(timer);
    };
  }, [open]);

  // Le champ grandit avec la question, jusqu'à quatre lignes.
  useEffect(() => {
    const field = inputRef.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${Math.min(field.scrollHeight + 2, 118)}px`;
  }, [input, open]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    const asked: Message = { role: 'user', content: question };
    const history: Message[] = [...messages.filter((m) => m.content), asked].slice(-KEEP);
    setMessages([...history, { role: 'assistant', content: '' }]);
    setInput('');
    setBusy(true);
    let answer = '';
    try {
      const res = await fetch('/api/tutor', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ program, module: moduleId, messages: history }),
      });
      if (res.status === 429) throw new Error('limit');
      if (!res.ok || !res.body) throw new Error(String(res.status));
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        answer += decoder.decode(value, { stream: true });
        setMessages([...history, { role: 'assistant', content: answer }]);
      }
      // Le serveur termine par « […] » quand la réponse a été coupée ; seul, c'est qu'il n'y a pas eu de réponse.
      if (!answer.replace('[…]', '').trim()) throw new Error('empty');
    } catch (error) {
      const failed = error instanceof Error && error.message === 'limit' ? t.limit : t.error;
      setMessages([...history, { role: 'assistant', content: answer.replace('[…]', '').trim() ? `${answer.trim()}\n\n${failed}` : failed }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {open && <div className={css.backdrop} aria-hidden="true" onClick={() => setOpen(false)} />}
      <div className={css.dock}>
        {open ? (
          <div className={css.sheet} role="dialog" aria-modal="true" aria-label={t.open}>
            <div className={css.head}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={KAI} alt="" width={420} height={437} />
              <div className={css.headText}>
                <strong>Kai</strong>
                <small>{t.role}</small>
              </div>
              <button type="button" className={css.close} aria-label={t.close} onClick={() => setOpen(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>

            <div className={css.thread} ref={threadRef} aria-live="polite">
              {messages.length === 0 && (
                <>
                  <p className={css.intro}>{t.hello}</p>
                  <div className={css.ideas}>
                    {t.suggestions.map((s) => (
                      <button key={s} type="button" className={css.idea} onClick={() => send(s)}>
                        {s}
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
                      </button>
                    ))}
                  </div>
                </>
              )}
              {messages.map((m, i) =>
                m.role === 'user' ? <p key={i} className={css.mine}>{m.content}</p>
                  : m.content ? <Answer key={i} text={m.content} />
                  : <span key={i} className={css.typing} role="status" aria-label={t.typing}><i /><i /><i /></span>,
              )}
            </div>

            <form className={css.composer} onSubmit={(e) => { e.preventDefault(); send(input); }}>
              <label className="skip" htmlFor="kai-input">{t.placeholder}</label>
              <textarea
                id="kai-input" ref={inputRef} rows={1} value={input} placeholder={t.placeholder} maxLength={2000} enterKeyHint="send"
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(input); } }}
              />
              <button type="submit" className={css.send} aria-label={t.send} disabled={busy || !input.trim()}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6" /></svg>
              </button>
            </form>
            <p className={css.fine}>{t.fine}</p>
          </div>
        ) : (
          <button type="button" className={`${css.launcher}${small ? ` ${css.launcherSmall}` : ''}`} aria-label={t.open} onClick={() => setOpen(true)}>
            {/* Le bouton, c'est Kai lui-même, avec sa bulle ; le libellé l'accompagne en haut de page. */}
            <strong>{t.launcher}</strong>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={KAI} alt="" width={420} height={437} />
          </button>
        )}
      </div>
    </>
  );
}
