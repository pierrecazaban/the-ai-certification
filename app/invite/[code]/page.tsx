import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Brand } from '@/components/Header';
import { isGuestCode } from '@/lib/guest';
import { guestJoinAction } from '@/lib/guestActions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'The AI Certification', robots: { index: false, follow: false } };

type Props = { params: Promise<{ code: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const T = {
  fr: {
    eyebrow: 'Invitation',
    title: 'Ton accès gratuit à The AI Certification',
    lead: 'Tu as été invité(e). Crée ton compte et accède tout de suite à la formation complète : 3 modules, environ 3 heures, ton agent IA et ton certificat à la fin. Rien à payer.',
    first: 'Prénom', last: 'Nom', email: 'Email', password: 'Mot de passe', passwordHelp: '8 caractères minimum.',
    terms: <>J’accepte les <Link href="/terms">conditions d’utilisation</Link> et la <Link href="/privacy">politique de confidentialité</Link>.</>,
    submit: 'Créer mon compte et commencer',
    signIn: 'Se connecter',
    errors: {
      code: 'Ce lien d’invitation n’est plus valable.',
      fields: 'Remplis ton prénom, ton nom et un email valide.',
      password: 'Choisis un mot de passe d’au moins 8 caractères.',
      terms: 'Accepte les conditions pour continuer.',
    },
    existsTitle: 'Ton accès est activé',
    existsText: 'Tu as déjà un compte avec cet email : la formation y est maintenant débloquée. Connecte-toi avec ton mot de passe habituel (ou « Mot de passe oublié ? »).',
    other: 'English version',
  },
  en: {
    eyebrow: 'Invitation',
    title: 'Your free access to The AI Certification',
    lead: 'You have been invited. Create your account and start the full course right away: 3 modules, about 3 hours, your own AI agent and your certificate at the end. Nothing to pay.',
    first: 'First name', last: 'Last name', email: 'Email', password: 'Password', passwordHelp: 'At least 8 characters.',
    terms: <>I accept the <Link href="/terms">terms of use</Link> and the <Link href="/privacy">privacy policy</Link>.</>,
    submit: 'Create my account and start',
    signIn: 'Sign in',
    errors: {
      code: 'This invite link is no longer valid.',
      fields: 'Enter your first name, last name and a valid email.',
      password: 'Choose a password of at least 8 characters.',
      terms: 'Accept the terms to continue.',
    },
    existsTitle: 'Your access is on',
    existsText: 'You already have an account with this email: the course is now unlocked in it. Sign in with your usual password (or “Forgot your password?”).',
    other: 'Version française',
  },
};

// Sign-up page for invited people: free account with the course unlocked. Only the current secret code opens it.
export default async function InvitePage({ params, searchParams }: Props) {
  const { code } = await params;
  if (!(await isGuestCode(code))) notFound();
  const query = await searchParams;
  const lang = query.lang === 'en' ? 'en' : 'fr';
  const t = T[lang];
  const error = t.errors[String(query.error ?? '') as keyof typeof t.errors];
  const loginHref = `/login?lang=${lang === 'fr' ? 'fr' : 'en-us'}`;

  return (
    <div lang={lang}>
      <header className="site-header">
        <nav className="container nav" aria-label="Main">
          <Brand />
          <Link className="btn btn-sm btn-green" href={loginHref}>{t.signIn}</Link>
        </nav>
      </header>
      <main id="main" className="register hero-bands">
        <div className="container">
          <div className="register-card">
            {query.done === 'exists' ? (
              <>
                <h1>{t.existsTitle}</h1>
                <p className="lead">{t.existsText}</p>
                <p><Link className="btn btn-green" href={loginHref}>{t.signIn}</Link></p>
              </>
            ) : (
              <>
                <span className="eyebrow">{t.eyebrow}</span>
                <h1>{t.title}</h1>
                <p className="lead" style={{ fontSize: 17 }}>{t.lead}</p>
                {error && <p className="alert" role="alert">{error}</p>}
                <form className="form" action={guestJoinAction}>
                  <input type="hidden" name="code" value={code} />
                  <input type="hidden" name="lang" value={lang} />
                  <div className="form-row">
                    <div className="field">
                      <label htmlFor="g-first">{t.first}</label>
                      <input id="g-first" name="first_name" autoComplete="given-name" required />
                    </div>
                    <div className="field">
                      <label htmlFor="g-last">{t.last}</label>
                      <input id="g-last" name="last_name" autoComplete="family-name" required />
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor="g-email">{t.email}</label>
                    <input id="g-email" name="email" type="email" inputMode="email" autoComplete="email" required />
                  </div>
                  <div className="field">
                    <label htmlFor="g-password">{t.password}</label>
                    <input id="g-password" name="password" type="password" autoComplete="new-password" minLength={8} required />
                    <p className="help">{t.passwordHelp}</p>
                  </div>
                  <label className="check">
                    <input type="checkbox" name="terms" required />
                    <span>{t.terms}</span>
                  </label>
                  <div><button className="btn btn-green" type="submit">{t.submit}</button></div>
                </form>
              </>
            )}
            <p className="help" style={{ marginTop: 20 }}>
              <Link href={`/invite/${code}?lang=${lang === 'fr' ? 'en' : 'fr'}`}>{t.other}</Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
