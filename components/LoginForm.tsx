'use client';

import { useState } from 'react';
import { member } from '@/lib/i18n/member';
import type { Locale } from '@/lib/locales';
import Spinner from '@/components/Spinner';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const post = (body: Record<string, string>) =>
  fetch('/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    .then((r) => r.json())
    .catch(() => null);

const WHO: Record<string, { aria: string; student: string; ambassador: string; ambLead: string; school: string; or: string }> = {
  en: { aria: 'Who are you?', student: 'Student', ambassador: 'Ambassador', ambLead: 'Ambassadors only: sign in with your school mailbox to manage your mails to the students.', school: 'Continue with my school mailbox', or: 'or with my ambassador account' },
  fr: { aria: 'Qui êtes-vous ?', student: 'Étudiant', ambassador: 'Ambassadeur', ambLead: 'Réservé aux ambassadeurs : connecte-toi avec la messagerie de ton école pour gérer tes mails aux étudiants.', school: 'Continuer avec la messagerie de mon école', or: 'ou avec mon compte ambassadeur' },
  es: { aria: '¿Quién eres?', student: 'Estudiante', ambassador: 'Embajador', ambLead: 'Solo para embajadores: inicia sesión con el correo de tu escuela para gestionar tus correos a los estudiantes.', school: 'Continuar con el correo de mi escuela', or: 'o con mi cuenta de embajador' },
  it: { aria: 'Chi sei?', student: 'Studente', ambassador: 'Ambasciatore', ambLead: 'Solo per gli ambasciatori: accedi con la casella della tua scuola per gestire le tue email agli studenti.', school: 'Continua con la casella della mia scuola', or: 'oppure con il mio account ambasciatore' },
  de: { aria: 'Wer bist du?', student: 'Student', ambassador: 'Botschafter', ambLead: 'Nur für Botschafter: Melde dich mit dem Postfach deiner Hochschule an, um deine Mails an die Studierenden zu verwalten.', school: 'Mit dem Postfach meiner Hochschule fortfahren', or: 'oder mit meinem Botschafter-Konto' },
};

export default function LoginForm({ locale, expired, reset = false }: { locale: Locale; expired: boolean; reset?: boolean }) {
  const t = member(locale).login;
  // "forgot" sends the link that sets a password: for a forgotten one, and for a first sign-in.
  const [mode, setMode] = useState<'login' | 'forgot'>(expired || reset ? 'forgot' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');
  const [devLink, setDevLink] = useState('');
  // Deux publics, deux entrées (22/11) : l'étudiant de la certification (email + mot de passe) et l'ambassadeur
  // (messagerie de son école, via Smart Mail). L'étudiant est le choix par défaut : c'est lui qui arrive ici le plus souvent.
  const [who, setWho] = useState<'student' | 'ambassador'>('student');
  const w = WHO[String(locale).slice(0, 2)] ?? WHO.en;

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    // An email, or the first and last name of an account without email (Biz Dev).
    if (!email.trim() || (email.includes('@') && !EMAIL.test(email.trim()))) return setError(t.invalid);
    setState('sending');
    const res = await post({ action: 'password_login', email, password, locale });
    if (res?.redirect) return window.location.assign(res.redirect);
    setState('idle');
    setError(res?.result === 'rate_limited' ? t.rateLimited : t.wrong);
  }

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!EMAIL.test(email.trim())) return setError(t.invalid);
    setState('sending');
    const res = await post({ action: 'request_login', email, locale });
    setState('sent');
    if (res?.dev_link) setDevLink(res.dev_link);
  }

  function switchTo(next: 'login' | 'forgot') {
    setMode(next);
    setState('idle');
    setError('');
  }

  const back = (
    <button type="button" className="linklike" onClick={() => switchTo('login')}>
      {t.back}
    </button>
  );

  return (
    <div className="register-card">
      <h1>{mode === 'login' ? t.title : t.setTitle}</h1>
      {expired && mode === 'forgot' && state !== 'sent' && <p className="alert" role="alert">{t.expired}</p>}
      {mode === 'forgot' && state === 'sent' ? (
        <>
          <p className="lead">{t.sent}</p>
          {devLink && (
            <p className="price-alert">
              <a href={devLink}>{t.devLink}</a>
            </p>
          )}
          <p>{back}</p>
        </>
      ) : mode === 'forgot' ? (
        <form className="form" onSubmit={sendLink}>
          <p className="help">{t.forgotLead}</p>
          <div className="field">
            <label htmlFor="login-email">{t.email}</label>
            <input id="login-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <div>
            <button className="btn btn-green" type="submit" disabled={state === 'sending'}>
              {state === 'sending' ? <><Spinner />{t.sending}</> : t.send}
            </button>
          </div>
          <p>{back}</p>
        </form>
      ) : (
        <form className="form" onSubmit={signIn}>
          <div className="login-who" role="tablist" aria-label={w.aria}>
            <button type="button" role="tab" aria-selected={who === 'student'} className={who === 'student' ? 'on' : ''} onClick={() => setWho('student')}>{w.student}</button>
            <button type="button" role="tab" aria-selected={who === 'ambassador'} className={who === 'ambassador' ? 'on' : ''} onClick={() => setWho('ambassador')}>{w.ambassador}</button>
          </div>
          {who === 'ambassador' && (
            <>
              {/* Ambassadeurs d'école (23/11) : connexion par leur messagerie d'école, via Smart Mail. Jamais montré à un étudiant. */}
              <p className="help">{w.ambLead}</p>
              <a className="btn btn-ghost login-school" href="/api/tool/enter?espace=1">{w.school}</a>
              <p className="join-or"><span>{w.or}</span></p>
            </>
          )}
          <p className="help">{t.lead}</p>
          <div className="field">
            <label htmlFor="login-email">{t.identifier}</label>
            <input id="login-email" type="text" autoComplete="username" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="login-password">{t.password}</label>
            <input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <div>
            <button className="btn btn-green" type="submit" disabled={state === 'sending'}>
              {state === 'sending' ? <><Spinner />{t.sending}</> : t.submit}
            </button>
          </div>
          <p>
            <button type="button" className="linklike" onClick={() => switchTo('forgot')}>
              {t.forgot}
            </button>
          </p>
        </form>
      )}
    </div>
  );
}
