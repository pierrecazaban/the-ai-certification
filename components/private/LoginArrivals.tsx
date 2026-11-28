import { arrivalsByOrigin, latestArrivals, type Arrival, type ArrivalKind, type OriginCount } from '@/lib/loginArrivals';
import RefreshButton from '@/components/private/RefreshButton';

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
// Sur /confirmation, venir de Stripe est le retour normal d'un paiement.
const shown = (k: ArrivalKind, path: string | boolean) =>
  k === 'stripe' && (path === true || (typeof path === 'string' && path.startsWith('/confirmation')))
    ? { label: 'Retour de paiement Stripe', tone: 'tone-ok' }
    : kind(k);

const at = (d: string | Date) =>
  new Date(d).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });

// Pages du site qui envoient vers /login d'elles-mêmes : c'est attendu, on le dit à côté de la ligne.
function note(a: Pick<Arrival, 'kind' | 'ref' | 'path'>) {
  if (a.kind !== 'interne') return '';
  const path = a.ref.replace(/^https?:\/\/[^/]+/, '');
  if (a.path.startsWith('/space')) {
    if (path.startsWith('/confirmation')) return 'depuis sa page de confirmation (le mot de passe choisi est noté à part dans le registre)';
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
  const suspicious = origins.filter((o) => (o.kind === 'stripe' && !o.conf) || o.kind === 'reetma').reduce((s, o) => s + o.week, 0);
  const paymentsBack = origins.filter((o) => o.kind === 'stripe' && o.conf).reduce((s, o) => s + o.day, 0);

  const wrap = { overflowWrap: 'anywhere' as const, wordBreak: 'break-word' as const };
  const muted = { color: 'var(--muted)', fontSize: 13 };
  const list = { listStyle: 'none', margin: 0, padding: 0 };
  const item = { padding: '12px 0', borderBottom: '1px solid var(--line)', display: 'grid', gap: 4, minWidth: 0 };
  const top = { display: 'flex', flexWrap: 'wrap' as const, alignItems: 'center', gap: 8, justifyContent: 'space-between' };

  return (
    <details className="cx-card" id="arrivees-login" style={{ minWidth: 0 }}>
      <summary style={{ cursor: 'pointer', listStyle: 'revert' }}>
        <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, verticalAlign: 'middle' }}>
          <strong style={{ fontSize: 18 }}>Arrivées sur la connexion, la confirmation et l’espace</strong>
          {paymentsBack > 0 && <span className="cx-badge tone-info">{paymentsBack} retour(s) de paiement en 24 h</span>}
          {suspicious > 0 ? (
            <span className="cx-badge tone-bad">{suspicious} depuis Stripe ou Reetma (7 j)</span>
          ) : (
            <span className="cx-badge tone-ok">Aucune depuis Stripe ou Reetma</span>
          )}
        </span>
      </summary>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 14 }}>
        <RefreshButton />
        <small style={{ color: 'var(--muted)', fontSize: 13 }}>données lues à {new Date().toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris' })}</small>
      </div>

      <h3 style={{ marginTop: 16 }}>D’où arrivent les gens</h3>
      <ul style={list}>
        {origins.length === 0 && <li style={{ ...item, ...muted }}>Aucune arrivée pour l’instant.</li>}
        {origins.map((o) => (
          <li key={`${o.kind}|${o.host}`} style={item}>
            <div style={top}>
              <span className={`cx-badge ${shown(o.kind, o.conf).tone}`}>{shown(o.kind, o.conf).label}</span>{o.conf && o.kind !== 'stripe' && <small style={muted}> → confirmation</small>}
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
              <span className={`cx-badge ${shown(a.kind, a.path).tone}`}>{shown(a.kind, a.path).label}</span>
              <small style={{ ...muted, fontVariantNumeric: 'tabular-nums' }}>{at(a.at)}</small>
            </div>
            <div style={wrap}>{a.ref || '—'}</div>
            <div style={{ ...wrap, ...muted }}>
              → {a.path}{a.query ? `?${a.query}` : ''} · {a.country || '?'} · {a.device} {a.browser}{a.bot ? ' · robot' : ''}
            </div>
            {a.who_ref && <small style={{ ...muted, ...wrap }}>qui : {a.who_ref}{a.who_name ? ` · ${a.who_name}` : ''}</small>}
            {note(a) && <small style={muted}>{note(a)}</small>}
          </li>
        ))}
      </ul>
    </details>
  );
}
