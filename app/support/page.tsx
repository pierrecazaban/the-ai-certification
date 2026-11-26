import type { Metadata } from 'next';
import Link from 'next/link';
import LegalPage from '@/components/LegalPage';
import SupportForm from '@/components/SupportForm';
import { localeFromSearchOrGeo } from '@/lib/requestLocale';

export const metadata: Metadata = { title: 'Help and contact | The AI Certification' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// The single way to reach the team: every request becomes a ticket answered by email.
// French for visitors in France (or ?lang=fr), English for everyone else.
export default async function SupportPage({ searchParams }: Props) {
  const topic = String((await searchParams).topic ?? '');
  const locale = await localeFromSearchOrGeo(searchParams);

  if (locale === 'fr') {
    return (
      <LegalPage locale="fr" title="Aide et contact" updated="Trouve une réponse rapide, ou ouvre une demande.">
        <img className="support-mascot" src="/assets/course/support.webp" alt="" width={160} height={160} />
        {/* En libre-service d’abord : la plupart des demandes sont un mot de passe perdu ou une question de remboursement. */}
        <h2>Réponses rapides</h2>
        <div className="help-shortcuts">
          <Link className="help-shortcut" href="/login?reset=1">
            <strong>Impossible de te connecter ?</strong>
            <span>Mot de passe oublié, ou jamais défini ? Reçois un lien pour en choisir un nouveau.</span>
            <span className="help-shortcut-cta">Réinitialiser mon mot de passe →</span>
          </Link>
          <Link className="help-shortcut" href="/refund-policy?lang=fr">
            <strong>Tu penses à un remboursement ?</strong>
            <span>Nos programmes sont des contenus numériques : les achats sont définitifs et non remboursables.</span>
            <span className="help-shortcut-cta">Voir le détail →</span>
          </Link>
        </div>

        <h2>Ouvrir une demande</h2>
        <p className="help">Pour tout le reste : écris-nous et nous répondons par email sous 7 jours ouvrés.</p>
        <div className="card" style={{ marginTop: 16 }}>
          <SupportForm topic={topic} locale="fr" />
        </div>
      </LegalPage>
    );
  }

  return (
    <LegalPage locale="en-us" title="Help and contact" updated="Find a quick answer, or open a request.">
      <img className="support-mascot" src="/assets/course/support.webp" alt="" width={160} height={160} />
      {/* Self-service first: most requests are a lost password or a refund question. */}
      <h2>Quick answers</h2>
      <div className="help-shortcuts">
        <Link className="help-shortcut" href="/login?reset=1">
          <strong>Can’t sign in?</strong>
          <span>Forgot your password, or never set one? Get a link to choose a new one.</span>
          <span className="help-shortcut-cta">Reset my password →</span>
        </Link>
        <Link className="help-shortcut" href="/refund-policy">
          <strong>Thinking about a refund?</strong>
          <span>Our programs are digital content: purchases are final and non-refundable.</span>
          <span className="help-shortcut-cta">See the details →</span>
        </Link>
      </div>

      <h2>Open a request</h2>
      <p className="help">Anything else: write to us and we answer by email within 7 working days.</p>
      <div className="card" style={{ marginTop: 16 }}>
        <SupportForm topic={topic} locale="en-us" />
      </div>
    </LegalPage>
  );
}
