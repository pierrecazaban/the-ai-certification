import type { Metadata } from 'next';
import Link from 'next/link';
import LegalPage from '@/components/LegalPage';
import { bookingByToken, CALL_MINUTES, frDay, frTime } from '@/lib/calls';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Appel confirmé | The AI Certification', robots: { index: false } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const gcal = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

// The candidate's page for their call: reached right after booking and from the confirmation email (reference + secret token).
export default async function CallConfirmed({ searchParams }: Props) {
  const p = await searchParams;
  const b = await bookingByToken(String(p.r ?? ''), String(p.t ?? ''));
  if (!b) {
    return (
      <LegalPage locale="fr" title="Rendez-vous introuvable" updated="Le lien est incomplet ou a expiré.">
        <p><Link href="/call">Réserver un appel →</Link></p>
      </LegalPage>
    );
  }
  const canceled = b.status !== 'booked';
  const when = `${frDay(b.starts_at)} à ${frTime(b.starts_at)}`;
  const addToCalendar = `https://calendar.google.com/calendar/render?${new URLSearchParams({
    action: 'TEMPLATE', text: 'Appel ambassadeur · The AI Certification', dates: `${gcal(b.starts_at)}/${gcal(b.ends_at)}`, details: `Lien de l’appel : ${b.meet_url}`, location: b.meet_url,
  })}`;

  return (
    <LegalPage locale="fr" title={canceled ? 'Appel annulé' : 'C’est confirmé !'} updated={`Référence ${b.reference}`}>
      {canceled ? (
        <p className="price-alert" role="status">Cet appel a été annulé. <Link href="/call">Choisir un autre créneau →</Link></p>
      ) : (
        <div className="card" style={{ marginTop: 16, display: 'grid', gap: 14 }}>
          <p style={{ fontSize: 18 }}>
            On se retrouve <strong style={{ textTransform: 'none' }}>{when}</strong> (heure de Paris), pour {CALL_MINUTES} minutes.
          </p>
          <p><a className="btn" href={b.meet_url} target="_blank" rel="noopener noreferrer">Rejoindre l’appel</a></p>
          <p style={{ wordBreak: 'break-all' }}>Lien de la visio : <a href={b.meet_url}>{b.meet_url}</a></p>
          <p><a href={addToCalendar} target="_blank" rel="noopener noreferrer">Ajouter à mon agenda Google →</a></p>
          <p className="help">Tu as aussi reçu ce lien par email ({b.email}).</p>
        </div>
      )}
    </LegalPage>
  );
}
