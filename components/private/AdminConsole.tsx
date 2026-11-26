import Link from 'next/link';
import { Suspense } from 'react';
import type { User } from '@/lib/auth';
import { sql } from '@/lib/db';
import { FEE_ESTIMATED, eurCentsSql, feeCentsSql, readNewStripeFees } from '@/lib/revenue';
import { getCourse, lessonIdsOf } from '@/lib/learning';
import { LOCALES, isLocale } from '@/lib/locales';
import Tickets from '@/components/private/Tickets';
import Commissions from '@/components/private/Commissions';
import Reviews from '@/components/private/Reviews';
import Settings from '@/components/private/Settings';
import Outreach from '@/components/private/Outreach';
import LiveVisitors from '@/components/private/LiveVisitors';
import CopyLink from '@/components/private/CopyLink';
import { GUEST_PAYMENT, guestCode, guestUrl } from '@/lib/guest';
import { ADMIN_TABS, AdminHeader } from '@/components/private/ConsoleHeaders';
import { programBySlug } from '@/lib/catalog';
import { decideSchoolRequestAction, resetGuestLinkAction } from '@/lib/privateActions';
import { setting } from '@/lib/settings';
import RevenueChart from '@/components/private/RevenueChart';
import { payReminderStatus } from '@/lib/payReminder';
import MailFrame from '@/components/private/MailFrame';

// Admin console, rendered by app/[locale]/page.tsx for signed-in admins only.
// It has no route of its own, so for anyone else its address behaves like any unknown address.
type Params = Record<string, string | string[] | undefined>;


const STATUS: Record<string, { label: string; tone: string }> = {
  paid: { label: 'Paid', tone: 'ok' },
  guest: { label: 'Guest (free)', tone: 'ok' },
  held: { label: 'Paying now', tone: 'warn' },
  expired: { label: 'Not paid', tone: 'muted' },
  canceled: { label: 'Not paid', tone: 'muted' },
  failed: { label: 'Not paid', tone: 'muted' },
  refunded: { label: 'Refunded', tone: 'muted' },
};
// Filters of the Students table: expired, cancelled and failed are all “not paid”.
const FILTERS: [string, string][] = [['', 'All'], ['paid', 'Paid'], ['guest', 'Guests'], ['unpaid', 'Not paid'], ['certified', 'Certified']];

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
const dt = (v: string | Date | null) =>
  v ? new Date(v).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }) : '—';
const bought = (r: { uni?: string | null; program?: string; organization?: string }) =>
  r.uni ?? [programBySlug(r.program ?? '')?.title ?? 'Certification', r.organization].filter(Boolean).join(' · ');
const lang = (l: string) => (isLocale(l) ? LOCALES[l].slug : l);

function Badge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, tone: 'muted' };
  return <span className={`cx-badge tone-${s.tone}`}>{s.label}</span>;
}

// Older addresses of sections now merged: students on the dashboard, contact requests and ambassadors in Tickets.
const MERGED: Record<string, string> = {
  demandes: 'tickets', ambassadeurs: 'tickets', inscriptions: 'etudiants', 'attente-paiement': 'etudiants', progression: 'etudiants', 'liste-attente': 'etudiants',
};

export default async function AdminConsole({ admin, params }: { admin: User; params: Params }) {
  const asked = MERGED[String(params.tab ?? '')] ?? String(params.tab ?? '');
  const tab = ADMIN_TABS.some((t) => t.id === asked) || asked === 'reglages' ? asked : 'apercu'; // settings: the gear in the header
  const q = String(params.q ?? '').trim().toLowerCase();
  const statusFilter = String(params.status ?? '');
  const id = String(params.id ?? '');

  return (
    <div className="cx">
      <AdminHeader admin={admin} tab={tab} />
      <main id="main" className="container cx-main">
        {asked === 'emails' ? (
          <>
            <p><Link href="/admin#etudiants">← Back to the dashboard</Link></p>
            <Emails id={id} q={q} />
          </>
        ) : tab === 'tickets' ? (
          <>
            {/* Ambassadors asking for one more school: decided here, next to the other requests. */}
            {!id && <SchoolRequests msg={String(params.msg ?? '')} />}
            <Tickets id={id} status={statusFilter} />
          </>
        ) : tab === 'commissions' ? (
          <Commissions id={id} msg={String(params.msg ?? '')} />
        ) : tab === 'avis' ? (
          <Reviews stars={String(params.stars ?? '')} />
        ) : tab === 'prospection' ? (
          <Outreach params={params} />
        ) : tab === 'reglages' ? (
          <Settings params={params} />
        ) : (
          <>
            <Overview name={admin.first_name} msg={String(params.msg ?? '')} />
            <div id="etudiants" className="cx-anchor"><Students q={asked === 'etudiants' ? q : ''} status={asked === 'etudiants' ? statusFilter : ''} /></div>
          </>
        )}
      </main>
    </div>
  );
}

// Test payments (mock checkout, Stripe test mode) are left out of every figure and list of the admin (14/11).
const NOT_TEST = `coalesce(payment_id, '') not like 'mock\\_%' and coalesce(payment_id, '') not like 'cs\\_test\\_%'`;

// Tuile revenus « après frais Stripe » (26/11) : les frais sont gardés vente par vente dans la base ; seules les
// ventes arrivées depuis la dernière ouverture sont lues chez Stripe. Toujours en différé (Suspense) par prudence.
// Les frais d'une vente remboursée restent comptés : Stripe ne les rend pas.
async function RevenueTile({ grossCents, n }: { grossCents: number; n: number }) {
  await readNewStripeFees();
  const [f] = await sql(
    `select coalesce(sum(${await feeCentsSql()}), 0)::int as fees, count(*) filter (where ${FEE_ESTIMATED})::int as estimated
       from registrations where status in ('paid', 'refunded') and payment_id is distinct from '${GUEST_PAYMENT}' and ${NOT_TEST}`,
  );
  const fees = Number(f.fees);
  return (
    <Kpi label="Revenue after Stripe fees" value={money(grossCents - fees, 'EUR')}
      sub={`${n} sale${n === 1 ? '' : 's'} · ${money(fees, 'EUR')} fees${Number(f.estimated) ? ' (est.)' : ''}`} />
  );
}

async function Overview({ name, msg }: { name: string; msg: string }) {
  const invite = await guestCode();
  // One figure in euros (19/11): sales in other currencies are converted (lib/revenue.ts), after Stripe fees.
  const [revenue] = await sql(
    `select coalesce(sum(${await eurCentsSql()}), 0)::int as cents, count(*)::int as n
     from registrations where status = 'paid' and payment_id is distinct from '${GUEST_PAYMENT}' and ${NOT_TEST}`,
  );
  // La tuile revenus se charge en différé (Suspense) : le reste de l'admin s'affiche tout de suite (24/11).
  const [counts] = await sql(`
    select
      count(*) filter (where status = 'paid' and payment_id is distinct from '${GUEST_PAYMENT}')::int as paid,
      count(*) filter (where status = 'paid' and payment_id = '${GUEST_PAYMENT}')::int as guests,
      count(*) filter (where status = 'held' and hold_expires_at > now())::int as held,
      count(*) filter (where status in ('expired','canceled','failed') or (status = 'held' and hold_expires_at <= now()))::int as lost,
      count(*) filter (where email_domain_mismatch and status = 'paid')::int as mismatch,
      count(*) filter (where payment_id is distinct from '${GUEST_PAYMENT}')::int as total
    from registrations where ${NOT_TEST}`);
  const [certs] = await sql('select count(*)::int as n from certificates');
  // Buyers: distinct people who paid (guests and test payments left out); "today" in Paris time.
  const BOUGHT = `r.status = 'paid' and r.payment_id is distinct from '${GUEST_PAYMENT}' and ${NOT_TEST.replaceAll('payment_id', 'r.payment_id')}`;
  const [buyers] = await sql(`
    select count(distinct lower(r.email))::int as n,
      count(distinct lower(r.email)) filter (where (coalesce(r.paid_at, r.created_at) at time zone 'Europe/Paris')::date = (now() at time zone 'Europe/Paris')::date)::int as today
    from registrations r where ${BOUGHT}`);
  const bySchool = await sql(`
    select coalesce(nullif(u.short_name, ''), u.name, 'No school') as school, count(distinct lower(r.email))::int as n,
      count(distinct lower(r.email)) filter (where (coalesce(r.paid_at, r.created_at) at time zone 'Europe/Paris')::date = (now() at time zone 'Europe/Paris')::date)::int as today
    from registrations r left join universities u on u.id = r.university_id
    where ${BOUGHT} group by 1 order by 2 desc, 1`);
  const conversion = counts.total ? Math.round((counts.paid / counts.total) * 100) : 0;


  return (
    <>
      <div className="cx-kpis">
        <LiveVisitors />
        <Suspense fallback={<Kpi label="Revenue" value={money(revenue.cents, 'EUR')} sub={`${revenue.n} sale${revenue.n === 1 ? '' : 's'} · computing fees…`} />}>
          <RevenueTile grossCents={revenue.cents} n={revenue.n} />
        </Suspense>
        <Kpi label="Paid registrations" value={String(counts.paid)} sub={`${conversion} % of registrations started`} />
        <Kpi label="Certificates issued" value={String(certs.n)} />
        <Kpi label="Guests (free access)" value={String(counts.guests)} sub="Signed up through the invite link" />
      </div>

      <Suspense fallback={<section className="cx-card cx-revenue"><div className="cx-revenue-top"><h2>Chiffre d’affaires</h2></div><p className="help">Chargement des frais Stripe…</p></section>}>
        <RevenueChart />
      </Suspense>

      <section className="cx-card" id="buyers">
        <h2>Buyers by school</h2>
        <p className="help">People who paid (one line per person, free guests and tests left out).</p>
        <table className="cx-table">
          <thead><tr><th>School</th><th className="num">Buyers</th><th className="num">Today</th></tr></thead>
          <tbody>
            {bySchool.map((s) => (
              <tr key={String(s.school)}><td>{String(s.school)}</td><td className="num">{s.n}</td><td className="num">{s.today}</td></tr>
            ))}
            <tr><td><strong>Total</strong></td><td className="num"><strong>{buyers.n}</strong></td><td className="num"><strong>{buyers.today}</strong></td></tr>
          </tbody>
        </table>
      </section>

      <section className="cx-card" id="invite">
        <h2>Invite link · free access</h2>
        <p className="help">Anyone with this link can create an account and follow the course for free. Share it only with people you invite.{msg === 'guest-link' ? ' New link created: the previous one no longer works.' : ''}</p>
        <CopyLink url={guestUrl(invite)} />
        <form action={resetGuestLinkAction} style={{ marginTop: 10 }}>
          <button className="btn btn-sm btn-ghost" type="submit">Create a new link (the current one stops working)</button>
        </form>
      </section>


    </>
  );
}

function Kpi({ label, value, sub, href }: { label: string; value: string; sub?: string; href?: string }) {
  const body = (
    <>
      <span>{label}</span>
      <strong>{value}</strong>
      {sub && <small>{sub}</small>}
    </>
  );
  return href ? <Link className="cx-kpi" href={href}>{body}</Link> : <div className="cx-kpi">{body}</div>;
}

/**
 * Everyone who started a registration, in one table: what they bought, where the payment stands (a place held
 * while paying), how far they are in the course, and the emails sent to them.
 */
async function Students({ q, status }: { q: string; status: string }) {
  // Payment reminders are automatic (23/11, lib/payReminder.ts): no button any more, only a line that says how they are
  // doing and warns when the task has stopped.
  const rem = await payReminderStatus();
  const hm = (d: Date) => d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
  const pct = (n: number, of: number) => (of ? ` (${Math.round((n / of) * 100)} %)` : '');
  const rows = await sql(
    `select r.*, u.name as uni, us.last_login_at,
       case when r.status = 'held' and r.hold_expires_at <= now() then 'expired' when r.status = 'paid' and r.payment_id = '${GUEST_PAYMENT}' then 'guest' else r.status end as live_status
     from registrations r
     left join universities u on u.id = r.university_id
     left join users us on us.id = r.user_id
     where ${NOT_TEST.replaceAll('payment_id', 'r.payment_id')} and ($1 = '' or lower(r.email) like $2 or lower(r.first_name || ' ' || r.last_name) like $2 or lower(r.reference) like $2 or lower(coalesce(u.name, '')) like $2)
     order by r.created_at desc limit 500`,
    [q, `%${q}%`],
  );
  const userIdsAll = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
  const certs = userIdsAll.length ? await sql('select user_id, program from certificates where user_id = any($1)', [userIdsAll]) : [];
  const certified = (r: Record<string, any>) => certs.some((c) => c.user_id === r.user_id && c.program === r.program);
  const filter = ['expired', 'canceled', 'failed'].includes(status) ? 'unpaid' : status;
  const filtered = rows.filter((r) =>
    filter === 'paid' ? r.live_status === 'paid'
      : filter === 'guest' ? r.live_status === 'guest'
      : filter === 'unpaid' ? ['expired', 'canceled', 'failed'].includes(r.live_status)
        : filter === 'certified' ? certified(r)
          : true,
  );
  const userIds = [...new Set(filtered.map((r) => r.user_id).filter(Boolean))];
  const done = userIds.length ? await sql('select user_id, lesson_id, completed_at from lesson_progress where user_id = any($1)', [userIds]) : [];
  const mails = await sql(
    `select id, to_email, registration_id, subject, status, created_at from emails
     where registration_id = any($1) or lower(to_email) = any($2) order by created_at desc`,
    [filtered.map((r) => r.id), [...new Set(filtered.map((r) => String(r.email).toLowerCase()))]],
  );
  const progress = (r: Record<string, any>) => {
    const course = getCourse(r.program, 'en-us');
    if (!course || !r.user_id) return null;
    const ids = new Set(lessonIdsOf(course));
    const mine = done.filter((d) => d.user_id === r.user_id && ids.has(d.lesson_id));
    const last = mine.reduce<string | null>((m, d) => (!m || d.completed_at > m ? d.completed_at : m), null);
    return { done: mine.length, total: ids.size, last, certified: certified(r) };
  };
  return (
    <section className="cx-card">
      <div className="cx-toolbar">
        <h2>Students <small>({filtered.length})</small></h2>
        <form className="cx-search" action="/admin#etudiants">
          <input type="hidden" name="tab" value="etudiants" />
          <input name="q" defaultValue={q} placeholder="Name, email, reference, school…" aria-label="Search" />
          {status && <input type="hidden" name="status" value={status} />}
          <button className="btn btn-sm" type="submit">Search</button>
        </form>
      </div>
      <p className="help" title="Un seul rappel par personne, 1 h après une inscription restée sans paiement, entre 9 h et 22 h. Jamais à quelqu’un qui a payé, qui a un ticket ou qui a été remboursé. Témoin : 1 personne sur 5 n’est pas rappelée jusqu’au 7/12, pour mesurer l’effet.">
        Rappels de paiement automatiques :{' '}
        {rem.clock.late
          ? <strong className="cx-flag">⚑ la tâche ne tourne plus{rem.clock.last ? ` depuis le ${hm(rem.clock.last)}` : ''}</strong>
          : <>dernier passage {hm(rem.clock.last!)}</>}
        {!rem.open.ok && !rem.clock.late ? ` · en pause (${rem.open.why})` : ''}
        {' · '}{rem.reminded} rappelé{rem.reminded > 1 ? 's' : ''}, {rem.remindedPaid} {rem.remindedPaid > 1 ? 'ont' : 'a'} payé ensuite{pct(rem.remindedPaid, rem.reminded)}
        {' · '}témoin : {rem.control} non rappelé{rem.control > 1 ? 's' : ''}, {rem.controlPaid} {rem.controlPaid > 1 ? 'ont' : 'a'} payé{pct(rem.controlPaid, rem.control)}
        {rem.stuck > 0 ? ` · ${rem.stuck} envoi${rem.stuck > 1 ? 's' : ''} interrompu${rem.stuck > 1 ? 's' : ''}, non rejoué${rem.stuck > 1 ? 's' : ''}` : ''}
      </p>
      <nav className="cx-pills" aria-label="Status" style={{ marginBottom: 12 }}>
        {FILTERS.map(([k, label]) => (
          <Link key={k} href={`/admin?tab=etudiants${k ? `&status=${k}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}#etudiants`} aria-current={filter === k ? 'page' : undefined}>{label}</Link>
        ))}
      </nav>
      {!(await setting('RESEND_API_KEY')) && <p className="price-alert">No Resend key configured: emails are stored but not sent.</p>}
      <div className="cx-scroll">
        <table className="cx-table">
          <thead>
            <tr><th>Date</th><th>Student</th><th>School or certification</th><th className="num">Amount</th><th>Payment</th><th>Progress</th><th>Emails</th></tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const p = progress(r);
              // A mail about one registration (confirmation, relance) shows on that line only (23/11): it used to show on every
              // line of the address, so a payer's relance looked sent to their old unpaid attempt. Login and ticket mails
              // (no registration) still show on every line of the address.
              const sent = mails.filter((m) => m.registration_id === r.id || (!m.registration_id && String(m.to_email).toLowerCase() === String(r.email).toLowerCase()));
              return (
                <tr key={r.id}>
                  <td>{dt(r.created_at)}</td>
                  <td>
                    <strong>{r.first_name} {r.last_name}</strong>
                    <small>{r.email}{r.email_domain_mismatch && <span className="cx-flag" title="The email does not match the school’s domain"> ⚑ domain</span>}</small>
                    <small>{r.reference}{r.phone ? ` · ${r.phone}` : ''} · /{lang(r.locale)}</small>
                  </td>
                  <td>{bought(r)}</td>
                  <td className="num">{money(r.amount_cents, r.currency)}</td>
                  <td>
                    <Badge status={r.live_status} />
                    {r.paid_at && <small>{dt(r.paid_at)}</small>}
                  </td>
                  <td>
                    {p ? (
                      <>
                        <div className="cx-meter"><span style={{ width: `${Math.round((p.done / Math.max(p.total, 1)) * 100)}%` }} /></div>
                        <small>{p.certified ? 'Certified ✓' : `${p.done} / ${p.total} lessons`}{p.last ? ` · ${dt(p.last)}` : ''}</small>
                      </>
                    ) : <small>—</small>}
                  </td>
                  <td>
                    {sent.length ? (
                      <>
                        <Link href={`/admin?tab=emails&id=${sent[0].id}`}>{sent.length} email{sent.length > 1 ? 's' : ''}</Link>
                        {sent.some((m) => m.status === 'failed') ? <small className="cx-flag">⚑ sending failed</small> : <small>Last: {dt(sent[0].created_at)}</small>}
                      </>
                    ) : <small>—</small>}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={7} className="empty">No student yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="help" style={{ marginTop: 10 }}><Link href="/admin?tab=emails">All emails sent</Link> (ambassadors and tickets included)</p>
    </section>
  );
}

async function Emails({ id, q }: { id: string; q: string }) {
  if (id) {
    const [email] = await sql('select * from emails where id::text = $1', [id]);
    if (email) {
      // Every mail sent to this person (23/11), latest first, one under the other: the page scrolls through them.
      const all = await sql('select * from emails where lower(to_email) = lower($1) order by created_at desc limit 60', [email.to_email]);
      const kindLabel: Record<string, string> = {
        login: 'Connexion', confirmation: 'Confirmation d’achat', finish_nudge: 'Relance formation', pay_reminder_1: 'Rappel de paiement',
        ticket_received: 'Ticket reçu', ticket_reply: 'Réponse à un ticket', ambassador_welcome: 'Bienvenue ambassadeur', call_booked: 'Appel réservé',
        outreach_alert: 'Alerte prospection', relance_alert: 'Alerte rappels', test: 'Test',
      };
      const badge = (m: Record<string, any>) => (
        <span className={`cx-badge tone-${m.status === 'sent' ? 'ok' : m.status === 'failed' ? 'bad' : 'muted'}`}>{m.status === 'sent' ? 'Envoyé' : m.status === 'failed' ? 'Refusé' : 'Non envoyé'}</span>
      );
      return (
        <section className="cx-card">
          <p><Link href="/admin?tab=emails">Tous les emails</Link></p>
          <h2>Mails envoyés à {email.to_email} <small>({all.length})</small></h2>
          <ol className="cx-mail-index">
            {all.map((m) => (
              <li key={m.id} className={m.id === email.id ? 'on' : ''}>
                <a href={`#mail-${m.id}`}><span>{dt(m.created_at)}</span><strong>{m.subject}</strong></a>
                <small>{kindLabel[m.kind] ?? m.kind}</small>
                {badge(m)}
              </li>
            ))}
          </ol>
          {all.map((m, n) => (
            <article key={m.id} id={`mail-${m.id}`} className="cx-mail">
              <h3><small>{all.length - n} / {all.length}</small> {m.subject}</h3>
              <p className="help">{dt(m.created_at)} · {kindLabel[m.kind] ?? m.kind} · {badge(m)}{m.error ? ` · ${m.error}` : ''}</p>
              {/* Rendered sandboxed: no scripts. */}
              <MailFrame html={m.html} title={m.subject} />
            </article>
          ))}
        </section>
      );
    }
  }
  const rows = await sql(
    `select id, to_email, subject, kind, status, created_at from emails
     where ($1 = '' or lower(to_email) like $2 or lower(subject) like $2)
     order by created_at desc limit 500`,
    [q, `%${q}%`],
  );
  return (
    <section className="cx-card">
      <div className="cx-toolbar">
        <h2>Emails <small>({rows.length})</small></h2>
        <form className="cx-search" action="/admin">
          <input type="hidden" name="tab" value="emails" />
          <input name="q" defaultValue={q} placeholder="Recipient or subject…" aria-label="Search" />
          <button className="btn btn-sm" type="submit">Filter</button>
        </form>
      </div>
      {!(await setting('RESEND_API_KEY')) && (
        <p className="price-alert">No Resend key configured: emails are stored here but not sent.</p>
      )}
      <div className="cx-scroll">
        <table className="cx-table">
          <thead><tr><th>Date</th><th>Recipient</th><th>Subject</th><th>Type</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{dt(r.created_at)}</td>
                <td>{r.to_email}</td>
                <td><Link href={`/admin?tab=emails&id=${r.id}#mail-${r.id}`}>{r.subject}</Link></td>
                <td>{r.kind === 'login' ? 'Sign-in' : r.kind === 'confirmation' ? 'Confirmation' : r.kind}</td>
                <td><span className={`cx-badge tone-${r.status === 'sent' ? 'ok' : r.status === 'failed' ? 'bad' : 'muted'}`}>{r.status === 'sent' ? 'Sent' : r.status === 'failed' ? 'Failed' : 'Stored'}</span></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="empty">No email.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

async function SchoolRequests({ msg }: { msg: string }) {
  const requests = await sql(
    `select sr.id, sr.created_at, sr.new_name, sr.new_city, u.name as school, u.state, us.first_name, us.last_name, us.email,
       (select string_agg(x.name, ', ') from school_claims c join universities x on x.id = c.university_id where c.user_id = sr.user_id) as holds
     from school_requests sr join users us on us.id = sr.user_id left join universities u on u.id = sr.university_id
     where sr.status = 'pending' order by sr.created_at`,
  );
  const notice: Record<string, string> = { accepted: 'Request accepted: the school is theirs.', refused: 'Request refused.', taken: 'That school was taken in the meantime.', gone: 'Request already handled.' };

  return (
    <>
      {requests.length > 0 && (
        <section className="cx-card">
          <h2>School requests <small>({requests.length})</small></h2>
          <p className="help">Each ambassador holds one school. To get another one, they ask for it here.</p>
          <div className="cx-scroll">
            <table className="cx-table">
              <thead><tr><th>Ambassador</th><th>Already holds</th><th>Asks for</th><th></th></tr></thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td><strong>{r.first_name} {r.last_name}</strong><small>{String(r.email).endsWith('@no-email.invalid') ? 'Biz Dev · no email' : r.email}</small></td>
                    <td>{r.holds ?? '—'}</td>
                    <td>{r.school ? <>{r.school}{r.state && <small>{r.state}</small>}</> : <>{r.new_name} <small>New school{r.new_city ? ` · ${r.new_city}` : ''}</small></>}</td>
                    <td>
                      <div className="cx-actions">
                        <form action={decideSchoolRequestAction}><input type="hidden" name="request_id" value={r.id} /><input type="hidden" name="accept" value="1" /><button className="btn btn-sm btn-green" type="submit">Accept</button></form>
                        <form action={decideSchoolRequestAction}><input type="hidden" name="request_id" value={r.id} /><button className="btn btn-sm" type="submit">Refuse</button></form>
                      </div>
                    </td>
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

/** Journal of the admin (15/11): who signed in, from where, what was opened and done. Most recent first. */
function device(ua: string) {
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  const nav = /Edg\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : ua ? ua.slice(0, 40) : '';
  return [os, nav].filter(Boolean).join(' · ') || '—';
}

