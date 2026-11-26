'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ambConnectAction } from '@/lib/prospectionActions';
import LinkedInLive from '@/components/private/LinkedInLive';

// L'accord de l'ambassadeur puis la vraie page de connexion LinkedIn, affichée en direct depuis le serveur de Paris
// (26/11). Le laissez-passer signé vaut 10 minutes. Une fois connecté, la page se relit : la carte montre le compte actif.
const ERRORS: Record<string, string> = {
  reserved: 'Only ambassadors can connect a LinkedIn account.',
  off: 'Prospection with LinkedIn is paused for now.',
  full: 'All the places of the pilot are taken for now. Try again in a few days.',
  stopping: 'Your previous connection is still being erased. Try again in a minute.',
  key: 'The connection service is not ready. Try again later.',
};

const TEXTS = {
  opening: 'Opening LinkedIn…',
  hint: 'This is the real LinkedIn sign-in page. Type your email, password and code as usual: they go to LinkedIn only.',
  connected: 'Your LinkedIn is connected{nom}. The assistant starts with its next pass.',
  failed: 'The connection did not work. Try again.',
  closed: 'The connection is closed.',
  network: 'The connection to the server was cut.',
  retry: 'Try again',
  cancel: 'Cancel',
  screen: 'LinkedIn sign-in page',
};

// Un seul bouton (26/11, demande de Pierre : plus de case à cocher) : l'appui vaut accord, il est daté sur le site
// (consent_at) et ouvre tout de suite la connexion LinkedIn. Dans l'aperçu de l'admin, l'appui dit pourquoi rien ne s'ouvre.
export default function AmbLinkedInConnect({ mode, preview = false }: { mode: 'start' | 'resume'; preview?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pass, setPass] = useState<{ token: string; url: string } | null>(null);

  const start = async () => {
    setError('');
    if (preview) { setError('Aperçu : la connexion LinkedIn se fait depuis un compte ambassadeur, pas depuis le compte admin.'); return; }
    setBusy(true);
    try {
      const r = await ambConnectAction(true);
      if (r.ok) setPass({ token: r.token, url: r.url });
      else setError(ERRORS[r.error] ?? 'Something went wrong. Try again.');
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (pass) {
    return (
      <LinkedInLive
        wsUrl={pass.url}
        token={pass.token}
        texts={TEXTS}
        onConnected={() => router.refresh()}
        // A pass opens only once: “Try again” asks the site for a new one.
        onRetry={() => { setPass(null); void start(); }}
      />
    );
  }
  return (
    <div className="lk-start">
      <div><button type="button" className="btn btn-green" disabled={busy} onClick={start}>{busy ? 'Opening…' : mode === 'start' ? 'Connect my LinkedIn' : 'Sign in to LinkedIn again'}</button></div>
      {error && <p className="help" role="alert">{error}</p>}
    </div>
  );
}
