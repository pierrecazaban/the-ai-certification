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

// Une seule entrée (22/11) : on donne son email, le compte dit la suite (mot de passe, ou messagerie de l'école pour
// un ambassadeur d'école). Personne ne choisit « étudiant » ou « ambassadeur ».
const STEP: Record<string, { next: string; school: string; change: string }> = {
  en: { next: 'Continue', school: 'Ambassador account recognised: opening the sign-in with your school mailbox…', change: 'Use another email' },
  fr: { next: 'Continuer', school: 'Compte ambassadeur reconnu : ouverture de la connexion avec la messagerie de ton école…', change: 'Utiliser un autre email' },
  es: { next: 'Continuar', school: 'Cuenta de embajador reconocida: abriendo el acceso con el correo de tu escuela…', change: 'Usar otro email' },
  it: { next: 'Continua', school: 'Account ambasciatore riconosciuto: apertura dell’accesso con la casella della tua scuola…', change: 'Usa un’altra email' },
  de: { next: 'Weiter', school: 'Botschafter-Konto erkannt: Die Anmeldung mit dem Postfach deiner Hochschule wird geöffnet…', change: 'Andere E-Mail verwenden' },
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
  // « id » : l'email seul ; « password » : le compte se connecte par mot de passe ; « school » : par la messagerie de l'école.
  const [step, setStep] = useState<'id' | 'password' | 'school'>('id');
  const s = STEP[String(locale).slice(0, 2)] ?? STEP.en;

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    // An email, or the first and last name of an account without email (Biz Dev).
    if (!email.trim() || (email.includes('@') && !EMAIL.test(email.trim()))) return setError(t.invalid);
    setState('sending');
    if (step === 'id') {
      const first = await post({ action: 'login_step', email });
      if (first?.result === 'rate_limited') { setState('idle'); return setError(t.rateLimited); }
      if (first?.step === 'school') {
        setStep('school');
        return window.location.assign(`/api/tool/enter?espace=1&srv=${encodeURIComponent(first.server || '')}`);
      }
      if (first?.step === 'link') {
        // Compte sans mot de passe : le lien de connexion part tout seul dans sa boîte.
        const sent = await post({ action: 'request_login', email, locale });
        setMode('forgot');
        setState('sent');
        if (sent?.dev_link) setDevLink(sent.dev_link);
        return;
      }
      setState('idle');
      return setStep('password');
    }
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
          <p className="help">{t.lead}</p>
          <div className="field">
            <label htmlFor="login-email">{t.identifier}</label>
            <input id="login-email" type="text" autoComplete="username" autoCapitalize="none" value={email}
              onChange={(e) => { setEmail(e.target.value); if (step !== 'id') { setStep('id'); setPassword(''); setError(''); } }} />
          </div>
          {step === 'password' && (
            <div className="field">
              <label htmlFor="login-password">{t.password}</label>
              <input id="login-password" type="password" autoComplete="current-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          )}
          {step === 'school' && <p className="help" role="status">{s.school}</p>}
          {error && <p className="error" role="alert">{error}</p>}
          <div>
            <button className="btn btn-green" type="submit" disabled={state === 'sending'}>
              {state === 'sending' ? <><Spinner />{step === 'id' ? s.next : t.sending}</> : step === 'id' ? s.next : t.submit}
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
