import { accountsWithoutPayment, latestSignIns, paidLater, paidOtherwise, reconSummary, type ReconRow, type ReconSummary } from '@/lib/reconciliation';
import { latestSchoolChoices, schoolChoicesBySchool, type ChoiceRow, type SchoolChoiceRow } from '@/lib/schoolChoices';
import { salesBySchool, type SchoolSalesRow } from '@/lib/schoolSales';

// /admin › Réglages (28/11) : rapprochement des comptes élèves avec les payeurs Stripe et les invités. Lecture seule.
const at = (d: unknown) =>
  d ? new Date(String(d)).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
const who = (r: ReconRow) => `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || '—';
const euros = (r: ReconRow) => `${(Number(r.amount_cents ?? 0) / 100).toFixed(2)} ${r.currency ?? ''}`;

const muted = { color: 'var(--muted)', fontSize: 13 };
const wrap = { overflowWrap: 'anywhere' as const, wordBreak: 'break-word' as const };
const list = { listStyle: 'none', margin: 0, padding: 0 };
const item = { padding: '10px 0', borderBottom: '1px solid var(--line)', display: 'grid', gap: 3, minWidth: 0 };

function Block({ title, rows, empty, line }: { title: string; rows: ReconRow[]; empty: string; line: (r: ReconRow) => React.ReactNode }) {
  return (
    <>
      <h3 style={{ marginTop: 20 }}>{title} <small style={muted}>({rows.length})</small></h3>
      <ul style={list}>
        {rows.length === 0 && <li style={{ ...item, ...muted }}>{empty}</li>}
        {rows.map((r, i) => <li key={i} style={item}>{line(r)}</li>)}
      </ul>
    </>
  );
}

export default async function Reconciliation() {
  let s: ReconSummary | null = null;
  let noPay: ReconRow[] = [], other: ReconRow[] = [], later: ReconRow[] = [], signIns: ReconRow[] = [];
  // Each list on its own: one failing query never hides the others.
  const safe = <T,>(p: Promise<T>, fallback: T) => p.catch((err) => { console.error('[rapprochement]', err); return fallback; });
  [s, noPay, other, later, signIns] = await Promise.all([
    safe<ReconSummary | null>(reconSummary(), null), safe(accountsWithoutPayment(), []), safe(paidOtherwise(), []), safe(paidLater(), []), safe(latestSignIns(), []),
  ]);
  const [bySchool, choices, sales] = await Promise.all([
    safe<SchoolChoiceRow[]>(schoolChoicesBySchool(), []), safe<ChoiceRow[]>(latestSchoolChoices(40), []), safe<SchoolSalesRow[]>(salesBySchool(), []),
  ]);
  const choicesDay = bySchool.reduce((n, r) => n + r.jour, 0);
  const choicesWeek = bySchool.reduce((n, r) => n + r.semaine, 0);
  const anomalies = s ? s.payees_autres + s.comptes_sans_paiement + s.payees_sans_compte : 0;

  return (
    <details className="cx-card" id="rapprochement" style={{ minWidth: 0 }}>
      <summary style={{ cursor: 'pointer', listStyle: 'revert' }}>
        <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, verticalAlign: 'middle' }}>
          <strong style={{ fontSize: 18 }}>Rapprochement : comptes, payeurs et invités</strong>
          {anomalies > 0 ? <span className="cx-badge tone-bad">{anomalies} à vérifier</span> : <span className="cx-badge tone-ok">Tout colle</span>}
        </span>
      </summary>

      {s && (
        <div className="cx-kpis" style={{ marginTop: 16 }}>
          <div className="cx-kpi"><span>Comptes élèves</span><strong>{s.eleves}</strong><small>{s.ambassadeurs} ambassadeurs à part</small></div>
          <div className="cx-kpi"><span>Payées par Stripe</span><strong>{s.payees_stripe}</strong><small>dont {s.payees_plus_tard} payées un autre jour que l’inscription</small></div>
          <div className="cx-kpi"><span>Invités (gratuit)</span><strong>{s.invites}</strong><small>lien d’invitation</small></div>
          <div className="cx-kpi"><span>Payées autrement</span><strong>{s.payees_autres}</strong><small>ni Stripe ni invitation : anormal</small></div>
          <div className="cx-kpi"><span>Comptes sans paiement</span><strong>{s.comptes_sans_paiement}</strong><small>élèves sans vente ni invitation</small></div>
          <div className="cx-kpi"><span>Payées sans compte</span><strong>{s.payees_sans_compte}</strong><small>{s.remboursees} remboursées · {s.en_cours} en cours</small></div>
        </div>
      )}

      <h3 style={{ marginTop: 20 }}>Ventes par école <small style={muted}>({sales.reduce((n, r) => n + r.jour, 0)} en 24 h · {sales.reduce((n, r) => n + r.semaine, 0)} en 7 jours · {sales.reduce((n, r) => n + r.total, 0)} au total)</small></h3>
      <ul style={list}>
        {sales.length === 0 && <li style={{ ...item, ...muted }}>Aucune vente Stripe.</li>}
        {sales.map((r) => (
          <li key={r.name} style={item}>
            <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' }}>
              <strong style={wrap}>{r.name}</strong>
              <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{r.total}</strong>
            </span>
            <span style={muted}>{r.jour} en 24 h · {r.semaine} en 7 j · {(r.euros / 100).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} € encaissés</span>
            <small style={muted}>dernier paiement {at(r.dernier)}</small>
          </li>
        ))}
      </ul>

      <h3 style={{ marginTop: 20 }}>Choix d’école dans l’annuaire <small style={muted}>({choicesDay} en 24 h · {choicesWeek} en 7 jours)</small></h3>
      <p style={muted}>Chaque école choisie dans la liste du formulaire, payée ou non ensuite, à côté des réservations et des ventes Stripe de cette école (7 jours).</p>
      <ul style={list}>
        {bySchool.length === 0 && <li style={{ ...item, ...muted }}>Aucun choix enregistré pour l’instant (compteur actif depuis le 28/11 au soir).</li>}
        {bySchool.map((r) => (
          <li key={r.name} style={item}>
            <strong style={wrap}>{r.name}</strong>
            <span style={muted}>{r.jour} choix en 24 h · {r.semaine} en 7 j · {r.reservations} réservation(s) · {r.payees} payée(s)</span>
            <small style={muted}>dernier choix {at(r.dernier)}</small>
          </li>
        ))}
      </ul>
      {choices.length > 0 && (
        <>
          <h3 style={{ marginTop: 20 }}>Derniers choix d’école</h3>
          <ul style={list}>
            {choices.map((c, i) => (
              <li key={i} style={{ ...item, gridTemplateColumns: '1fr auto' }}>
                <span style={wrap}>{c.name}</span>
                <small style={muted}>{at(c.at)}</small>
              </li>
            ))}
          </ul>
        </>
      )}

      <Block
        title="Payées autrement que par Stripe ou une invitation"
        rows={other}
        empty="Aucune : chaque inscription payée vient de Stripe ou du lien d’invitation."
        line={(r) => (
          <>
            <strong style={wrap}>{who(r)} · {r.reference}</strong>
            <span style={{ ...wrap, ...muted }}>{r.email} · {euros(r)} · paiement {r.paiement}</span>
            <small style={muted}>inscrite {at(r.created_at)} · payée {at(r.paid_at)}</small>
          </>
        )}
      />
      <Block
        title="Comptes élèves sans paiement ni invitation"
        rows={noPay}
        empty="Aucun : chaque compte élève a une vente ou une invitation."
        line={(r) => (
          <>
            <strong style={wrap}>{who(r)}</strong>
            <span style={{ ...wrap, ...muted }}>{r.email}{r.mot_de_passe ? ' · a un mot de passe' : ''}</span>
            <small style={muted}>compte créé {at(r.created_at)} · dernière connexion {at(r.last_login_at)}{r.inscriptions ? ` · ${r.inscriptions}` : ''}</small>
          </>
        )}
      />
      <Block
        title="Payées par Stripe un autre jour que l’inscription (30 jours)"
        rows={later}
        empty="Aucune."
        line={(r) => (
          <>
            <strong style={wrap}>{who(r)} · {r.reference}</strong>
            <span style={{ ...wrap, ...muted }}>{r.email} · {euros(r)}</span>
            <small style={muted}>inscrite {at(r.created_at)} · payée {at(r.paid_at)}</small>
          </>
        )}
      />
      <Block
        title="Dernières ouvertures de session"
        rows={signIns}
        empty="Aucune."
        line={(r) => (
          <>
            <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' }}>
              <strong style={wrap}>{who(r)}</strong>
              <small style={muted}>{at(r.created_at)}</small>
            </span>
            <span style={{ ...wrap, ...muted }}>{r.email} · {r.role === 'student' ? 'élève' : r.role}</span>
            <small style={muted}>{r.payee ? `payée : ${r.payee}` : r.role === 'student' ? 'AUCUNE inscription payée' : ''}</small>
          </>
        )}
      />
    </details>
  );
}
