import { arrivalsByOrigin, arrivalsSince, latestArrivals, type Arrival, type ArrivalKind, type OriginCount } from '@/lib/loginArrivals';

// /admin › Réglages (28/11) : d'où arrivent les visiteurs de la connexion et de l'espace élève (lib/loginArrivals.ts). Lecture seule.
const KIND: Record<ArrivalKind, { label: string; tone: string }> = {
  stripe: { label: 'Page Stripe', tone: 'tone-bad' },
  reetma: { label: 'Site Reetma', tone: 'tone-bad' },
  externe: { label: 'Autre site', tone: 'tone-warn' },
  connu: { label: 'Moteur, réseau ou messagerie', tone: 'tone-info' },
  messagerie: { label: 'Messagerie d’école', tone: 'tone-info' },
  interne: { label: 'Le site', tone: 'tone-ok' },
  'sans-provenance': { label: 'Lien externe, origine cachée', tone: 'tone-muted' },
  directe: { label: 'Directe (tapée, favori, appli)', tone: 'tone-muted' },
};
const kind = (k: ArrivalKind) => KIND[k] ?? { label: k, tone: 'tone-muted' };

const at = (d: string | Date) =>
  new Date(d).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });

// Pages du site qui envoient vers /login d'elles-mêmes : c'est attendu, on le dit à côté de la ligne.
function note(a: Pick<Arrival, 'kind' | 'ref' | 'path'>) {
  if (a.kind !== 'interne') return '';
  const path = a.ref.replace(/^https?:\/\/[^/]+/, '');
  if (a.path.startsWith('/space')) {
    if (path.startsWith('/confirmation')) return 'nouvel acheteur, juste après avoir choisi son mot de passe';
    if (path === '/login' || path.startsWith('/login/')) return 'juste après la connexion';
    return '';
  }
  if (path.startsWith('/confirmation')) return 'après un paiement, compte qui existait déjà (bouton « Ouvrir mon espace »)';
  if (path.startsWith('/finish')) return 'lien de relance d’une personne qui a déjà payé';
  if (path.startsWith('/space') || path.startsWith('/admin') || path.startsWith('/ambassador')) return 'espace ouvert sans être connecté';
  if (path === '/login' || path.startsWith('/login/')) return 'depuis la page de connexion elle-même';
  return '';
}

export default async function LoginArrivals() {
  let rows: Arrival[] = [];
  let origins: OriginCount[] = [];
  let since: string | null = null;
  try {
    [rows, origins, since] = await Promise.all([latestArrivals(150), arrivalsByOrigin(), arrivalsSince()]);
  } catch {
    // table not ready yet: shown empty
  }
  const suspicious = origins.filter((o) => o.kind === 'stripe' || o.kind === 'reetma').reduce((s, o) => s + o.week, 0);

  return (
    <section className="cx-card" id="arrivees-login">
      <div className="cx-toolbar">
        <h2 style={{ margin: 0 }}>Arrivées sur la connexion et l’espace élève</h2>
        {suspicious > 0 ? (
          <span className="cx-badge tone-bad">{suspicious} depuis Stripe ou Reetma (7 jours)</span>
        ) : (
          <span className="cx-badge tone-ok">Aucune depuis Stripe ou Reetma</span>
        )}
      </div>
      <p className="help">
        Chaque visite de /login, /login/password et /space{since ? ` depuis le ${at(since)}` : ''} : la page d’où vient la personne
        (sans ses paramètres), la page demandée, le pays et l’appareil. Rien qui identifie la personne : ni adresse IP, ni cookie.
        Après un paiement, le site renvoie vers /confirmation, puis vers /space ou /login : une arrivée sur ces pages directement
        depuis une page Stripe ou un site Reetma est donc anormale et s’affiche en rouge.
      </p>

      <h3>D’où arrivent les gens (robots exclus)</h3>
      <table className="cx-table">
        <thead>
          <tr><th>Provenance</th><th>Site d’origine</th><th className="num">24 h</th><th className="num">7 jours</th><th>Dernière</th></tr>
        </thead>
        <tbody>
          {origins.length === 0 && <tr><td className="empty" colSpan={5}>Aucune arrivée enregistrée pour l’instant.</td></tr>}
          {origins.map((o) => (
            <tr key={`${o.kind}|${o.host}`}>
              <td><span className={`cx-badge ${kind(o.kind).tone}`}>{kind(o.kind).label}</span></td>
              <td>{o.host || '—'}</td>
              <td className="num">{o.day}</td>
              <td className="num">{o.week}</td>
              <td>{at(o.last)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 style={{ marginTop: 24 }}>Les {rows.length} dernières arrivées</h3>
      <table className="cx-table">
        <thead>
          <tr><th>Heure (Paris)</th><th>Provenance</th><th>Page d’origine</th><th>Page demandée</th><th>Pays</th><th>Appareil</th></tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td className="empty" colSpan={6}>Aucune arrivée enregistrée pour l’instant.</td></tr>}
          {rows.map((a, i) => (
            <tr key={`${a.at}-${i}`}>
              <td className="num">{at(a.at)}</td>
              <td><span className={`cx-badge ${kind(a.kind).tone}`}>{kind(a.kind).label}</span></td>
              <td>
                {a.ref || '—'}
                {note(a) && <small>{note(a)}</small>}
              </td>
              <td>{a.path}{a.query ? `?${a.query}` : ''}</td>
              <td>{a.country || '?'}</td>
              <td>
                {a.device} {a.browser}
                {a.bot && <small>robot</small>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
