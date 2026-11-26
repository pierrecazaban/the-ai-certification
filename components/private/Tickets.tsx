import Link from 'next/link';
import { sql } from '@/lib/db';
import { PRIVATE_SLUGS } from '@/lib/private';
import { markPayoutPaidAction, refusePayoutAction, replyTicketAction } from '@/lib/privateActions';
import TicketStatusSelect from '@/components/private/TicketStatusSelect';

// Admin "Tickets" tab: every request sent from /support, answered from here by email.

const STATUS: Record<string, { label: string; tone: string }> = {
  open: { label: 'To handle', tone: 'warn' },
  answered: { label: 'Answered', tone: 'ok' },
  closed: { label: 'Closed', tone: 'muted' },
};
const CATEGORY: Record<string, string> = {
  registration: 'Registration', payment: 'Payment', access: 'Access', certificate: 'Certificate', company: 'Company / school', refund: 'Refund', payout: 'Ambassador payout', school: 'School request', other: 'Other',
};
const dt = (v: string | Date) => new Date(v).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
const href = (q: string) => `/${PRIVATE_SLUGS.admin}?tab=tickets${q}`;

function Badge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, tone: 'muted' };
  return <span className={`cx-badge tone-${s.tone}`}>{s.label}</span>;
}

export default async function Tickets({ id, status }: { id: string; status: string }) {
  if (id) {
    const [t] = await sql('select * from tickets where id::text = $1', [id]);
    if (t) {
      const thread = await sql('select * from ticket_messages where ticket_id = $1 order by created_at', [t.id]);
      // Demande de virement d'un ambassadeur (22/11) : ses virements, avec le bouton à cliquer une fois le virement fait.
      // Chaque virement garde son ticket (24/11) : les boutons ne sont proposés que sur celui de CE ticket (ou sur un
      // virement d'avant, sans lien). Avec deux demandes ouvertes, on ne clôt plus le mauvais ticket.
      const payouts = t.category === 'payout'
        ? await sql(
            `select p.*, p.ticket_id::text as ticket, p.user_id::text as owner from payouts p join users u on u.id = p.user_id
              where lower(u.email) = lower($1) order by (p.ticket_id::text = $2) desc, p.requested_at desc limit 20`,
            [t.email, String(t.id)],
          )
        : [];
      const mine = (p: Record<string, unknown>) => !p.ticket || p.ticket === String(t.id);
      return (
        <section className="cx-card">
          <p><Link href={`/${PRIVATE_SLUGS.admin}?tab=tickets`}>← All tickets</Link></p>
          <div className="cx-toolbar">
            <h2>{t.reference}</h2>
            <TicketStatusSelect id={String(t.id)} status={t.status} back={`id=${t.id}`} />
          </div>
          <p className="help">
            {t.name} · {t.email} · {CATEGORY[t.category] ?? t.category}{t.registration_ref ? ` · ${t.registration_ref}` : ''} · /{t.locale} · {dt(t.created_at)}
          </p>
          {thread.map((m) => (
            <div key={m.id} className={`cx-ticket-msg is-${m.author}`}>
              <small>{m.author === 'admin' ? 'The AI Certification' : t.name} · {dt(m.created_at)}</small>
              <p>{m.body}</p>
            </div>
          ))}
          {payouts.length > 0 && (
            <p className="help" style={{ marginTop: 16 }}>
              <Link href={`/${PRIVATE_SLUGS.admin}?tab=commissions&id=${payouts[0].owner}`}>Voir ses commissions et son solde</Link>
            </p>
          )}
          {/* En cartes (24/11) : au téléphone, « Transfer done » était hors de l'écran, au bout d'un tableau à faire défiler. */}
          {payouts.length > 0 && (
            <ul className="cm-list">
              {payouts.map((p) => (
                <li key={p.id}>
                  <div className="cm-payout">
                    <span className="cm-who">
                      <strong>{new Intl.NumberFormat('en-GB', { style: 'currency', currency: p.currency }).format(p.amount_cents / 100)}</strong>
                      <small>{dt(p.requested_at)} · {p.iban_holder}</small>
                      <code className="cm-iban">{String(p.iban).replace(/(.{4})/g, '$1 ').trim()}</code>
                    </span>
                    {p.status === 'paid' ? (
                      <span className="cx-badge tone-ok">Paid {p.paid_at ? dt(p.paid_at) : ''}</span>
                    ) : p.status === 'refused' ? (
                      <span className="cx-badge tone-muted">Refused</span>
                    ) : mine(p) ? (
                      <div className="cx-payout-acts">
                        <form action={markPayoutPaidAction}>
                          <input type="hidden" name="payout_id" value={p.id} />
                          <input type="hidden" name="ticket_id" value={t.id} />
                          <button className="btn btn-sm btn-green" type="submit">Transfer done</button>
                        </form>
                        {/* Refuser (24/11) : le montant revient dans le solde de l'ambassadeur. Deux gestes, pour ne pas refuser par erreur. */}
                        <details className="cx-setting-edit">
                          <summary className="btn btn-sm btn-ghost">Refuser</summary>
                          <form action={refusePayoutAction}>
                            <input type="hidden" name="payout_id" value={p.id} />
                            <input type="hidden" name="ticket_id" value={t.id} />
                            <button className="btn btn-sm" type="submit">Confirmer le refus</button>
                          </form>
                        </details>
                      </div>
                    ) : (
                      <Link href={href(`&id=${p.ticket}`)}>Autre demande : son ticket</Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <form action={replyTicketAction} className="form" style={{ marginTop: 16 }}>
            <input type="hidden" name="ticket_id" value={t.id} />
            <div className="field">
              <label htmlFor="reply">Reply (sent by email to {t.email})</label>
              <textarea id="reply" name="body" rows={6} required />
            </div>
            <div><button className="btn btn-green" type="submit">Send the reply</button></div>
          </form>
        </section>
      );
    }
  }

  const rows = await sql(
    `select t.*, (select body from ticket_messages m where m.ticket_id = t.id order by created_at limit 1) as first
     from tickets t where ($1 = '' or t.status = $1)
     order by (t.status = 'open') desc, t.updated_at desc limit 500`,
    [status],
  );
  return (
    <section className="cx-card">
      <div className="cx-toolbar">
        <h2>Tickets <small>({rows.filter((r) => r.status === 'open').length} to handle)</small></h2>
        <nav className="cx-pills" aria-label="Status">
          {[['', 'All'], ['open', 'To handle'], ['answered', 'Answered'], ['closed', 'Closed']].map(([k, v]) => (
            <Link key={k} href={href(k ? `&status=${k}#tickets` : '#tickets')} aria-current={status === k ? 'page' : undefined}>{v}</Link>
          ))}
        </nav>
      </div>
      <div className="cx-scroll">
        <table className="cx-table">
          <thead><tr><th>Received</th><th>Ticket</th><th>Topic</th><th>Message</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{dt(r.created_at)}</td>
                <td><Link href={href(`&id=${r.id}`)}><strong>{r.reference}</strong></Link><small>{r.name} · {r.email}</small></td>
                <td>{CATEGORY[r.category] ?? r.category}</td>
                <td style={{ maxWidth: 420 }}><small>{String(r.first ?? '').slice(0, 160)}</small></td>
                <td><TicketStatusSelect id={String(r.id)} status={r.status} back={status ? `status=${status}` : ''} /></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="empty">No ticket.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
