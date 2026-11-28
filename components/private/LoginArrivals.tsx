import { arrivalsByOrigin, latestArrivals, type Arrival, type ArrivalKind, type OriginCount } from '@/lib/loginArrivals';

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
  try {
    [rows, origins] = await Promise.all([latestArrivals(100), arrivalsByOrigin()]);
  } catch {
    // table not ready yet: shown empty
  }
  const suspicious = origins.filter((o) => o.kind === 'stripe' || o.kind === 'reetma').reduce((s, o) => s + o.week, 0);

  const wrap = { overflowWrap: 'anywhere' as const, wordBreak: 'break-word' as const };
  const muted = { color: 'var(--muted)', fontSize: 13 };
  const list = { listStyle: 'none', margin: 0, padding: 0 };
  const item = { padding: '12px 0', borderBottom: '1px solid var(--line)', display: 'grid', gap: 4, minWidth: 0 };
  const top = { display: 'flex', flexWrap: 'wrap' as const, alignItems: 'center', gap: 8, justifyContent: 'space-between' };

  return (
    <details className="cx-card" id="arrivees-login" style={{ minWidth: 0 }}>
      <summary style={{ cursor: 'pointer', listStyle: 'revert' }}>
        <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, verticalAlign: 'middle' }}>
          <strong style={{ fontSize: 18 }}>Arrivées sur la connexion et l’espace</strong>
          {suspicious > 0 ? (
            <span className="cx-badge tone-bad">{suspicious} depuis Stripe ou Reetma (7 j)</span>
          ) : (
            <span className="cx-badge tone-ok">Aucune depuis Stripe ou Reetma</span>
          )}
        </span>
      </summary>

      <h3 style={{ marginTop: 16 }}>D’où arrivent les gens</h3>
      <ul style={list}>
        {origins.length === 0 && <li style={{ ...item, ...muted }}>Aucune arrivée pour l’instant.</li>}
        {origins.map((o) => (
          <li key={`${o.kind}|${o.host}`} style={item}>
            <div style={top}>
              <span className={`cx-badge ${kind(o.kind).tone}`}>{kind(o.kind).label}</span>
              <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{o.day} <small style={muted}>24 h</small> · {o.week} <small style={muted}>7 j</small></strong>
            </div>
            <div style={wrap}>{o.host || '—'}</div>
            <small style={muted}>Dernière : {at(o.last)}</small>
          </li>
        ))}
      </ul>

      <h3 style={{ marginTop: 24 }}>Dernières arrivées</h3>
      <ul style={list}>
        {rows.length === 0 && <li style={{ ...item, ...muted }}>Aucune arrivée pour l’instant.</li>}
        {rows.map((a, i) => (
          <li key={`${a.at}-${i}`} style={item}>
            <div style={top}>
              <span className={`cx-badge ${kind(a.kind).tone}`}>{kind(a.kind).label}</span>
              <small style={{ ...muted, fontVariantNumeric: 'tabular-nums' }}>{at(a.at)}</small>
            </div>
            <div style={wrap}>{a.ref || '—'}</div>
            <div style={{ ...wrap, ...muted }}>
              → {a.path}{a.query ? `?${a.query}` : ''} · {a.country || '?'} · {a.device} {a.browser}{a.bot ? ' · robot' : ''}
            </div>
            {note(a) && <small style={muted}>{note(a)}</small>}
          </li>
        ))}
      </ul>
    </details>
  );
}
