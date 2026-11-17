'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { SITE_DOMAIN } from '@/lib/site';

// The floating assistant (bottom right): answers questions about The AI Certification and helps visitors register.
// Opening it hides the launcher and blurs the page behind; Escape or a click outside closes it.

type Message = { role: 'user' | 'assistant'; content: string };

// Pages where the bubble would get in the way: the private spaces and sign-in.
const HIDDEN = [/^\/admin(\/|$)/, /^\/ambassador(\/|$)/, /^\/space/, /^\/login/];
const STORE = 'cfx_chat';

const SUGGESTIONS = ['C’est quoi la certification IA ?', 'Combien ça coûte ?', 'Ça vaut le coup pour mon CV ?', 'Is it for me?'];

/** Plain URLs become links, **bold** stays bold; everything else is text. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s)]+[^\s).,;!?]|\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? <a key={i} href={p}>{p.replace(/^https?:\/\/(www\.)?/, '')}</a>
          : /^\*\*[^*]+\*\*$/.test(p) ? <strong key={i}>{p.slice(2, -2)}</strong>
          : <span key={i}>{p}</span>,
      )}
    </>
  );
}

const Kai = ({ size = 36 }: { size?: number }) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img className="chat-kai" src="/assets/kai-avatar.png" alt="" width={size} height={size} />
);

export default function ChatWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // The conversation survives page changes within the visit.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORE);
      if (saved) setMessages(JSON.parse(saved));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(messages));
    } catch {}
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // Open: Escape closes, the page behind does not scroll, the field takes the focus.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.documentElement.classList.add('chat-open');
    const t = setTimeout(() => inputRef.current?.focus(), 150);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.documentElement.classList.remove('chat-open');
      clearTimeout(t);
    };
  }, [open]);

  if (HIDDEN.some((r) => r.test(pathname))) return null;

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    const history: Message[] = [...messages, { role: 'user', content: question }];
    setMessages([...history, { role: 'assistant', content: '' }]);
    setInput('');
    setBusy(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: history, page: pathname }),
      });
      if (!res.ok || !res.body) throw new Error(String(res.status));
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let answer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        answer += decoder.decode(value, { stream: true });
        setMessages([...history, { role: 'assistant', content: answer }]);
      }
    } catch {
      setMessages([...history, { role: 'assistant', content: `Oups, je n’arrive pas à répondre pour le moment. Réessaie dans un instant, ou écris-nous sur ${SITE_DOMAIN}/support.` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {open && <div className="chat-backdrop" aria-hidden="true" onClick={() => setOpen(false)} />}
      <div className="chat">
        {open && (
          <section className="chat-panel" role="dialog" aria-modal="true" aria-label="Kai, l’assistant de The AI Certification">
            <header className="chat-head">
              <span className="chat-head-avatar"><Kai size={44} /><span className="chat-online" aria-hidden="true" /></span>
              <div className="chat-head-text">
                <strong>Kai</strong>
                <small>Assistant The AI Certification · en ligne</small>
              </div>
              <button type="button" className="chat-close" aria-label="Fermer" onClick={() => setOpen(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </header>

            <div className="chat-list" ref={listRef} aria-live="polite">
              <div className="chat-row is-assistant">
                <Kai size={28} />
                <p className="chat-msg is-assistant">
                  Salut, moi c’est Kai 👋 Pose-moi n’importe quelle question sur la certification IA : contenu, prix, temps, intérêt pour ton CV… Hi! Ask me anything, in any language.
                </p>
              </div>
              {messages.map((m, i) => (
                <div key={i} className={`chat-row is-${m.role}`}>
                  {m.role === 'assistant' && <Kai size={28} />}
                  <p className={`chat-msg is-${m.role}`}>
                    {m.content ? <Rich text={m.content} /> : <span className="chat-typing" aria-label="Kai écrit…"><i /><i /><i /></span>}
                  </p>
                </div>
              ))}
              {messages.length === 0 && (
                <div className="chat-suggestions">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" onClick={() => send(s)}>{s}</button>
                  ))}
                </div>
              )}
            </div>

            <form className="chat-form" onSubmit={(e) => { e.preventDefault(); send(input); }}>
              <label className="skip" htmlFor="chat-input">Ta question</label>
              <input id="chat-input" ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Écris ta question…" maxLength={1500} autoComplete="off" />
              <button type="submit" className="chat-send" aria-label="Envoyer" disabled={busy || !input.trim()}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </button>
            </form>
          </section>
        )}
        {!open && (
          <button type="button" className="chat-bubble" aria-expanded={false} aria-label="Ouvrir l’assistant" onClick={() => setOpen(true)}>
            {/* Filled message with a small AI spark, and a green "online" dot. */}
            <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2c-4.97 0-9 3.47-9 7.75 0 2.3 1.17 4.37 3.03 5.79-.17 1.25-.75 2.4-1.7 3.34 1.86-.13 3.55-.8 4.83-1.86.9.24 1.85.37 2.84.37 4.97 0 9-3.47 9-7.64S16.97 3.2 12 3.2z" fill="#17274C" /><path d="M12 6.6l.95 2.55 2.55.95-2.55.95L12 13.6l-.95-2.55-2.55-.95 2.55-.95z" fill="#FFB020" /></svg>
            <span className="chat-bubble-dot" aria-hidden="true" />
          </button>
        )}
      </div>
    </>
  );
}
