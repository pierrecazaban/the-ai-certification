import { linkedInGate } from '@/lib/prospection';
import AmbLinkedInConnect from '@/components/private/AmbLinkedInConnect';

// Page plein écran « Prospect with your LinkedIn » (26/11, demande de Pierre) : elle s'ouvre chaque fois que
// l'ambassadeur arrive dans son espace tant que son LinkedIn ne prospecte pas (lib/prospection.ts linkedInGate).
// « Not now » mène à l'espace pour cette visite seulement (?ensuite=1) : la page revient à la visite suivante.
// `preview` : l'admin la voit telle quelle en arrivant sur la vue ambassadeur, bouton de connexion inactif ; « Not now »
// le mène à la vue habituelle (en gardant l'ambassadeur choisi avec ?voir=).
export default async function AmbLinkedInGate({ userId, preview = false, voir }: { userId: string; preview?: boolean; voir?: string }) {
  const p = await linkedInGate(userId);
  if (!p && !preview) return null;
  const status = p?.account?.status ?? 'none';
  const resume = status === 'connecting' || status === 'paused';
  const skip = `?ensuite=1${preview && voir ? `&voir=${encodeURIComponent(voir)}` : ''}`;
  return (
    <main id="main" className="container lk-gate">
      <div className="lk-gate-box" id="linkedin">
        {preview && (
          <p className="help" lang="fr" style={{ margin: 0 }}>
            Aperçu : la page que voit un ambassadeur à chaque arrivée tant que son LinkedIn ne prospecte pas (bouton de connexion inactif).{' '}
            <a href={skip}>Aller à la vue ambassadeur</a>
          </p>
        )}
        <h1>Prospect with your LinkedIn</h1>
        <p className="lead">Connect your LinkedIn and grow your network: your account prospects for you, and your prospects show up here.</p>
        {status === 'paused' && <p className="price-alert" role="status">Paused: {p?.account?.reason || 'safety stop'}. Sign in to LinkedIn again to start again.</p>}
        <AmbLinkedInConnect mode={resume ? 'resume' : 'start'} preview={preview} />
        <p className="lk-gate-skip">
          <a href={skip}>Not now, go to my space</a>
        </p>
      </div>
    </main>
  );
}
