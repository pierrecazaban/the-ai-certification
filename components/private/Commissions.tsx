import Link from 'next/link';
import { randomUUID } from 'node:crypto';
import { sql } from '@/lib/db';
import { PRIVATE_SLUGS } from '@/lib/private';
import { ambassadorBalances, CURRENCIES } from '@/lib/team';
import { addCommissionAction, cancelAutoCommissionsAction, cancelCommissionAction } from '@/lib/privateActions';

// Admin › Commissions (24/11) : Pierre saisit lui-même ce que gagne chaque ambassadeur. La liste donne le solde de chacun,
// la fiche d'un ambassadeur permet d'ajouter une ligne, d'en annuler une, et montre ses virements. Les demandes de
// virement arrivent en tickets (onglet Tickets) : c'est là qu'on clique « Transfer done » ou « Refuser ».

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const href = (q = '') => `/${PRIVATE_SLUGS.admin}?tab=commissions${q}`;
const dt = (v: string | Date) => new Date(v).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
// Une monnaie inconnue ferait planter Intl : elle s'affiche alors telle quelle.
const money = (cents: number, currency: string) => {
  try {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency, minimumFractionDigits: 2 }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
};
const fullName = (r: Row) => `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || String(r.email ?? 'Ambassadeur');
// Les comptes sans adresse (nom + mot de passe) ont une adresse technique : on ne l'affiche pas.
const shownEmail = (email: unknown) => (String(email ?? '').endsWith('@no-email.invalid') ? '' : String(email ?? ''));

const MESSAGES: Record<string, { text: string; bad?: boolean }> = {
  added: { text: 'Commission ajoutée.' },
  amount: { text: 'Montant refusé : entre 0,01 et 10 000, avec deux décimales au plus.', bad: true },
  currency: { text: 'Monnaie refusée.', bad: true },
  unknown: { text: 'Ambassadeur introuvable.', bad: true },
  cancelled: { text: 'Ligne annulée : elle ne compte plus dans le solde.' },
  withdrawn: { text: 'Impossible d’annuler cette ligne : son montant a déjà été demandé ou versé.', bad: true },
  gone: { text: 'Cette ligne n’existe plus.', bad: true },
  auto_cancelled: { text: 'Lignes automatiques annulées.' },
  auto_kept: { text: 'Rien n’a été annulé : une partie de ces lignes a déjà été demandée ou versée. Annulez-les une par une.', bad: true },
  paye: { text: 'Virement noté comme fait.' },
  refuse: { text: 'Demande refusée : le montant est revenu dans le solde.' },
};

function Notice({ msg }: { msg: string }) {
  const m = MESSAGES[msg];
  return m ? <p className="price-alert" role="status">{m.text}</p> : null;
}

/** Montants de plusieurs monnaies sur une ligne ; « 0,00 € » quand il n'y a rien. */
const sums = (parts: { cents: number; currency: string }[]) =>
  parts.filter((p) => p.cents !== 0).map((p) => money(p.cents, p.currency)).join(' · ') || money(0, 'EUR');

export default async function Commissions({ id, msg }: { id: string; msg: string }) {
  if (UUID.test(id)) {
    const detail = await Detail({ id, msg });
    if (detail) return detail;
  }

  const rows = await ambassadorBalances();
  const people = new Map<string, { who: Row; lines: Row[] }>();
  for (const r of rows) {
    const p = people.get(r.user_id) ?? { who: r, lines: [] };
    if (r.currency) p.lines.push(r);
    people.set(r.user_id, p);
  }
  const total = (p: { lines: Row[] }, k: string) => p.lines.reduce((s, l) => s + Math.abs(Number(l[k])), 0);
  // D'abord ceux qui attendent un virement, puis ceux qui ont un solde, puis les autres ; par nom dans chaque groupe.
  const rank = (p: { lines: Row[] }) => (total(p, 'pending') ? 0 : total(p, 'earned') || total(p, 'paid') ? 1 : 2);
  const list = [...people.values()].sort((a, b) => rank(a) - rank(b) || fullName(a.who).localeCompare(fullName(b.who), 'fr'));

  const pending = await sql(
    `select p.id, p.amount_cents, p.currency, p.requested_at, p.ticket_id::text as ticket_id, p.user_id::text as user_id, u.first_name, u.last_name, u.email
       from payouts p join users u on u.id = p.user_id where p.status = 'requested' order by p.requested_at`,
  );

  return (
    <>
      <Notice msg={msg} />
      {pending.length > 0 && (
        <section className="cx-card">
          <h2>Virements demandés <small>({pending.length} à faire)</small></h2>
          <p className="help">Chaque demande est un ticket : ouvrez-le pour voir l’IBAN, puis « Transfer done » une fois le virement parti, ou « Refuser ».</p>
          <ul className="cm-list">
            {pending.map((p) => (
              <li key={p.id}>
                <Link href={p.ticket_id ? `/${PRIVATE_SLUGS.admin}?tab=tickets&id=${p.ticket_id}` : `/${PRIVATE_SLUGS.admin}?tab=tickets&status=open`}>
                  <span className="cm-who"><strong>{fullName(p)}</strong><small>Demandé le {dt(p.requested_at)}</small></span>
                  <span className="cm-sums"><strong>{money(p.amount_cents, p.currency)}</strong><small>Ouvrir le ticket</small></span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="cx-card">
        <h2>Ambassadeurs <small>({list.length})</small></h2>
        <p className="help">
          Touchez un nom pour saisir une commission ou voir ses lignes. Un ambassadeur apparaît ici dès qu’il a ouvert son espace sur le site une fois.
        </p>
        <ul className="cm-list">
          {list.map(({ who, lines }) => {
            const auto = lines.reduce((s, l) => s + Number(l.auto_lines), 0);
            const negative = lines.some((l) => Number(l.available) < 0);
            return (
              <li key={who.user_id}>
                <Link href={href(`&id=${who.user_id}`)}>
                  <span className="cm-who">
                    <strong>{fullName(who)}</strong>
                    <small>{[who.school, shownEmail(who.email)].filter(Boolean).join(' · ') || '—'}</small>
                    {auto > 0 && <small className="cm-flag">{auto} ligne{auto > 1 ? 's' : ''} automatique{auto > 1 ? 's' : ''} à vérifier</small>}
                  </span>
                  <span className="cm-sums">
                    <strong className={negative ? 'cm-neg' : undefined}>{sums(lines.map((l) => ({ cents: Number(l.available), currency: l.currency })))}</strong>
                    {(total({ lines }, 'requested') > 0 || total({ lines }, 'paid') > 0) && (
                      <small>
                        {[
                          total({ lines }, 'requested') ? `demandé ${sums(lines.map((l) => ({ cents: Number(l.requested), currency: l.currency })))}` : '',
                          total({ lines }, 'paid') ? `versé ${sums(lines.map((l) => ({ cents: Number(l.paid), currency: l.currency })))}` : '',
                        ].filter(Boolean).join(' · ')}
                      </small>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
          {list.length === 0 && <li className="cm-empty">Aucun ambassadeur pour l’instant.</li>}
        </ul>
      </section>
    </>
  );
}

/** La fiche d'un ambassadeur : son solde, le formulaire de saisie, ses lignes, ses virements. Rien si l'identifiant ne correspond à personne. */
async function Detail({ id, msg }: { id: string; msg: string }) {
  const [who] = await sql(
    `select u.id::text as user_id, u.first_name, u.last_name, u.email, a.iban, a.iban_holder
       from ambassadors a join users u on u.id = a.user_id where a.user_id::text = $1 and u.role <> 'admin'`,
    [id],
  );
  if (!who) return null;
  const lines = await sql(
    `select cm.id::text as id, cm.amount_cents, cm.currency, cm.status, cm.label, cm.created_at, cm.registration_id, cm.rate_bp,
            r.first_name, r.last_name, r.status as reg_status, coalesce(r.payment_id, '') as payment_id, u.name as school
       from commissions cm left join registrations r on r.id = cm.registration_id left join universities u on u.id = r.university_id
      where cm.user_id::text = $1 order by cm.created_at desc limit 1000`,
    [id],
  );
  const payouts = await sql(
    `select id::text as id, amount_cents, currency, status, requested_at, paid_at, ticket_id::text as ticket_id from payouts where user_id::text = $1 order by requested_at desc limit 200`,
    [id],
  );
  const live = lines.filter((l) => l.status !== 'cancelled');
  const currencies = [...new Set([...live.map((l) => String(l.currency)), ...payouts.map((p) => String(p.currency))])].sort();
  const of = (rows: Row[], currency: string, keep: (r: Row) => boolean) =>
    rows.filter((r) => r.currency === currency && keep(r)).reduce((s, r) => s + Number(r.amount_cents), 0);
  const balance = currencies.map((currency) => {
    const earned = of(live, currency, () => true);
    const requested = of(payouts, currency, (p) => p.status === 'requested');
    const paid = of(payouts, currency, (p) => p.status === 'paid');
    return { currency, earned, requested, paid, available: earned - requested - paid };
  });
  const autoLive = live.filter((l) => l.registration_id);
  const iban = String(who.iban ?? '');
  const name = fullName(who);
  const test = (l: Row) => /^(mock_|cs_test_)/.test(String(l.payment_id));

  return (
    <>
      <p><Link href={href()}>← Tous les ambassadeurs</Link></p>
      <Notice msg={msg} />
      <div className="cx-kpis">
        <div className="cx-kpi"><span>Disponible</span><strong className={balance.some((b) => b.available < 0) ? 'cm-neg' : undefined}>{sums(balance.map((b) => ({ cents: b.available, currency: b.currency })))}</strong></div>
        <div className="cx-kpi"><span>Demandé</span><strong>{sums(balance.map((b) => ({ cents: b.requested, currency: b.currency })))}</strong></div>
        <div className="cx-kpi"><span>Versé</span><strong>{sums(balance.map((b) => ({ cents: b.paid, currency: b.currency })))}</strong></div>
      </div>

      <section className="cx-card">
        <h2>{name}</h2>
        <p className="help">
          {shownEmail(who.email) || 'Compte sans adresse'} · {iban ? `IBAN enregistré (${who.iban_holder}) : ${iban.slice(0, 4)} •••• ${iban.slice(-4)}` : 'Pas encore d’IBAN enregistré'}
        </p>
        <form action={addCommissionAction} className="form cm-form">
          {/* Créé à l'affichage : renvoyer deux fois le même formulaire n'ajoute qu'une ligne. */}
          <input type="hidden" name="line_id" value={randomUUID()} />
          <input type="hidden" name="user_id" value={who.user_id} />
          {/* Pour le journal de l'admin seulement : qui a été crédité. */}
          <input type="hidden" name="ambassador" value={name} />
          <div className="field">
            <label htmlFor="cm-amount">Montant</label>
            <input id="cm-amount" name="amount" inputMode="decimal" placeholder="25,50" autoComplete="off" required />
          </div>
          <div className="field">
            <label htmlFor="cm-currency">Monnaie</label>
            <select id="cm-currency" name="currency" defaultValue={currencies.find((c) => (CURRENCIES as readonly string[]).includes(c)) ?? 'EUR'}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="field cm-wide">
            <label htmlFor="cm-label">Note (l’ambassadeur la voit)</label>
            <input id="cm-label" name="label" maxLength={120} placeholder="Ventes de la semaine du 23/11" autoComplete="off" />
          </div>
          <div className="cm-wide"><button className="btn btn-green" type="submit">Ajouter la commission</button></div>
        </form>
      </section>

      <section className="cx-card">
        <div className="cx-toolbar">
          <h2>Lignes <small>({live.length}{lines.length > live.length ? `, ${lines.length - live.length} annulée${lines.length - live.length > 1 ? 's' : ''}` : ''})</small></h2>
          {autoLive.length > 0 && (
            <details className="cx-setting-edit">
              <summary className="btn btn-sm btn-ghost">Annuler les {autoLive.length} lignes automatiques</summary>
              <form action={cancelAutoCommissionsAction}>
                <input type="hidden" name="user_id" value={who.user_id} />
                <input type="hidden" name="ambassador" value={name} />
                <button className="btn btn-sm" type="submit">Confirmer : annuler {autoLive.length} ligne{autoLive.length > 1 ? 's' : ''} ({sums(currencies.map((c) => ({ cents: of(autoLive, c, () => true), currency: c })))})</button>
              </form>
            </details>
          )}
        </div>
        {autoLive.length > 0 && <p className="help">Les lignes « automatique » viennent de l’ancien calcul à chaque vente (arrêté le 24/11). Elles comptent dans le solde tant qu’elles ne sont pas annulées.</p>}
        <div className="cx-scroll">
          <table className="cx-table">
            <thead><tr><th>Ligne</th><th className="num">Montant</th><th></th></tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className={l.status === 'cancelled' ? 'cm-off' : undefined}>
                  <td>
                    {l.registration_id ? (
                      <>
                        <strong>{`${l.first_name ?? ''} ${l.last_name ?? ''}`.trim() || 'Vente'}</strong>
                        <small>
                          {dt(l.created_at)} · automatique · {l.school ?? 'école inconnue'} · {Number(l.rate_bp) / 100} %
                          {test(l) && <span className="cx-flag"> ⚑ paiement de test</span>}
                          {l.reg_status && l.reg_status !== 'paid' && <span className="cx-flag"> ⚑ vente non payée ({l.reg_status})</span>}
                        </small>
                      </>
                    ) : (
                      <>
                        <strong>{l.label || 'Commission'}</strong>
                        <small>{dt(l.created_at)} · saisie dans l’admin</small>
                      </>
                    )}
                  </td>
                  <td className="num">{money(l.amount_cents, l.currency)}</td>
                  <td>
                    {l.status === 'cancelled' ? (
                      <span className="cx-badge tone-muted">Annulée</span>
                    ) : (
                      <details className="cx-setting-edit">
                        <summary className="btn btn-sm btn-ghost">Annuler</summary>
                        <form action={cancelCommissionAction}>
                          <input type="hidden" name="line_id" value={l.id} />
                          <input type="hidden" name="user_id" value={who.user_id} />
                          <input type="hidden" name="ambassador" value={name} />
                          <input type="hidden" name="amount" value={money(l.amount_cents, l.currency)} />
                          <button className="btn btn-sm" type="submit">Confirmer</button>
                        </form>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
              {lines.length === 0 && <tr><td colSpan={3} className="empty">Aucune commission pour l’instant.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {payouts.length > 0 && (
        <section className="cx-card">
          <h2>Virements <small>({payouts.length})</small></h2>
          <div className="cx-scroll">
            <table className="cx-table">
              <thead><tr><th>Demandé le</th><th className="num">Montant</th><th>État</th><th></th></tr></thead>
              <tbody>
                {payouts.map((p) => (
                  <tr key={p.id}>
                    <td>{dt(p.requested_at)}</td>
                    <td className="num">{money(p.amount_cents, p.currency)}</td>
                    <td>
                      {p.status === 'paid' ? <span className="cx-badge tone-ok">Versé{p.paid_at ? ` le ${dt(p.paid_at)}` : ''}</span>
                        : p.status === 'refused' ? <span className="cx-badge tone-muted">Refusé</span>
                          : <span className="cx-badge tone-warn">À faire</span>}
                    </td>
                    <td>{p.ticket_id ? <Link href={`/${PRIVATE_SLUGS.admin}?tab=tickets&id=${p.ticket_id}`}>Ticket</Link> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
