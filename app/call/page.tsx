import type { Metadata } from 'next';
import LegalPage from '@/components/LegalPage';
import CallPicker from '@/components/CallPicker';
import { CALL_MINUTES, freeSlots, prospectByToken } from '@/lib/calls';
import { bookCallAction } from '@/lib/callActions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Réserver un appel | The AI Certification', robots: { index: false } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const ERRORS: Record<string, string> = {
  invalid: 'Indique ton prénom, un email valide et choisis un créneau.',
  taken: 'Ce créneau vient d’être pris. Choisis-en un autre.',
  rate: 'Trop de tentatives. Réessaie dans une heure.',
};

// Booking page linked from the LinkedIn messages to ambassador candidates: /call?t=<personal token> (or ?ref=<profile slug>).
export default async function CallPage({ searchParams }: Props) {
  const params = await searchParams;
  const ref = String(params.ref ?? '').slice(0, 200);
  const error = ERRORS[String(params.error ?? '')] ?? '';
  const [days, prospect] = await Promise.all([freeSlots(), prospectByToken(String(params.t ?? ''))]);

  return (
    <LegalPage locale="fr" title="Réserve ton appel ambassadeur" updated={`${CALL_MINUTES} minutes en visio pour découvrir le programme ambassadeurs de The AI Certification.`}>
      <div className="card" style={{ marginTop: 16 }}>
        <p style={{ marginBottom: 12 }}>
          On cherche <strong>un ambassadeur par école</strong> pour représenter The AI Certification sur son campus, avec <strong>10 % de commission</strong> sur les ventes.
          Choisis le jour et l’heure qui t’arrangent : tu reçois le lien de la visio tout de suite, ici et par email.
        </p>
      </div>
      {error && <p className="price-alert" role="alert">{error}</p>}
      {days.length ? (
        <div className="card" style={{ marginTop: 16 }}>
          <CallPicker days={days} linkedin={ref} prospect={prospect} action={bookCallAction} />
        </div>
      ) : (
        <p className="price-alert" role="status">Aucun créneau n’est ouvert pour le moment. Reviens dans quelques jours, de nouveaux créneaux arrivent chaque semaine.</p>
      )}
    </LegalPage>
  );
}
