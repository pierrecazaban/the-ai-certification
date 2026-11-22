import { Brand } from '../Header';
import Link from 'next/link';
import { AMBASSADOR_TERMS_VERSION, RATES } from '@/lib/team';
import { joinAction } from '@/lib/privateActions';

type Params = Record<string, string | string[] | undefined>;

const ERRORS: Record<string, string> = {
  invalid: 'Enter a valid email address.',
  password: 'Choose a password of at least 8 characters.',
  exists: 'An account already uses this email. Sign in instead.',
  terms: 'Accept the ambassador terms to continue.',
};

// Biz Dev sign-up, reached only through an invite link (/<code>): username and password, no email (20/11, username 22/11).
// Rendered on the server, no client code.
export default async function JoinPage({ code, inviterName, params }: { code: string; inviterName: string; params: Params }) {
  const error = ERRORS[String(params.error ?? '')];

  return (
    <div lang="en">
      <header className="site-header">
        <nav className="container nav" aria-label="Main">
          <Brand />
          {/* Already an ambassador: signing in leads straight to the ambassador space. */}
          <Link className="btn btn-sm btn-green" href="/login?lang=en-us">Sign in</Link>
        </nav>
      </header>
      <main id="main" className="register hero-bands">
        <div className="container">
          <div className="register-card">
            <>
                <span className="eyebrow">Invited{inviterName ? ` by ${inviterName}` : ''}</span>
                <h1>Become an ambassador for The AI Certification</h1>
                <p className="lead" style={{ fontSize: 17 }}>
                  Every student of a school you bring in who pays for The AI Certification earns you {RATES.owner / 100} % of what they pay, automatically.
                  When an ambassador you invite does the same at their school, you earn {RATES.parent / 100} %.
                </p>
                {error && <p className="alert" role="alert">{error}</p>}
                {/* On rejoint seulement avec son email d'école (23/11) : Smart Mail, programmer ses mails, puis l'espace ambassadeur. */}
                <a className="btn btn-green join-school" href={`/api/tool/enter?invite=${code}`}>Continue with my school email</a>
                <p className="help" style={{ margin: '8px 0 22px' }}>You connect your school mailbox, schedule your mails to the students, then open your ambassador space.</p>
            </>
          </div>
        </div>
      </main>
    </div>
  );
}
