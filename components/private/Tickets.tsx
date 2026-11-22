import Link from 'next/link';
import { sql } from '@/lib/db';
import { PRIVATE_SLUGS } from '@/lib/private';
import { markPayoutPaidAction, replyTicketAction } from '@/lib/privateActions';
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
      const payouts = t.category === 'payout'
        ? await sql(
            `select p.* from payouts p join users u on u.id = p.user_id where lower(u.email) = lower($1) order by p.requested_at desc limit 20`,
            [t.email],
          )
        : [];
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
            <div className="cx-scroll" style={{ marginTop: 16 }}>
              <table className="cx-table">
                <thead><tr><th>Requested</th><th>Amount</th><th>Account holder</th><th>IBAN</th><th>Status</th></tr></thead>
                <tbody>
                  {payouts.map((p) => (
                    <tr key={p.id}>
                      <td>{dt(p.requested_at)}</td>
                      <td><strong>{new Intl.NumberFormat('en-GB', { style: 'currency', currency: p.currency }).format(p.amount_cents / 100)}</strong></td>
                      <td>{p.iban_holder}</td>
                      <td><code>{String(p.iban).replace(/(.{4})/g, '$1 ').trim()}</code></td>
                      <td>
                        {p.status === 'paid' ? (
                          <span className="cx-badge tone-ok">Paid {p.paid_at ? dt(p.paid_at) : ''}</span>
                        ) : (
                          <form action={markPayoutPaidAction}>
                            <input type="hidden" name="payout_id" value={p.id} />
                            <input type="hidden" name="ticket_id" value={t.id} />
                            <button className="btn btn-sm btn-green" type="submit">Transfer done</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
