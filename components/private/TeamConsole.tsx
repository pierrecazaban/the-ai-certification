import DeleteShortButton from '@/components/private/DeleteShortButton';
import { gradeOf } from '@/lib/grades';
import { AdminHeader, TeamHeader } from '@/components/private/ConsoleHeaders';
import type { User } from '@/lib/auth';
import { sql } from '@/lib/db';
import { ensureAmbassador, freeSchools, payoutBalances, RATES, toolCodeOf } from '@/lib/team';
import { claimSchoolAction, requestPayoutAction, saveBankAction, showInTreeAction } from '@/lib/privateActions';
import { PRIVATE_SLUGS } from '@/lib/private';
import { siteUrl } from '@/lib/site';
import UniversityPicker from '@/components/UniversityPicker';
import NetworkPyramid, { type PyramidNode } from '@/components/private/NetworkPyramid';
import ShortInvite from '@/components/private/ShortInvite';
import AmbProspection from '@/components/private/AmbProspection';
import AmbProspectionPreview from '@/components/private/AmbProspectionPreview';
import AmbLinkedInGate from '@/components/private/AmbLinkedInGate';
import { linkedInGate } from '@/lib/prospection';

// Ambassador space, rendered by app/[locale]/page.tsx for signed-in ambassadors only. Server-rendered, no client code.
type Params = Record<string, string | string[] | undefined>;

const BASE = () => siteUrl();

const MESSAGES: Record<string, string> = {
  claimed: 'The school is yours.',
  taken: 'Someone already holds that school.',
  pick: 'Choose a school in the list, or type the name of yours.',
  requested: 'Request sent. The AI Certification will review it shortly.',
  pending: 'You already have a request being reviewed.',
  bank_saved: 'Bank details saved.',
  bank_invalid: 'Check the account holder and the IBAN.',
  ok: 'Payout requested. The funds are sent to your bank account within 48 hours.',
  nothing: 'Nothing available to withdraw yet.',
  amount: 'Choose an amount above zero and no higher than what is available.',
  no_iban: 'Add your bank details first.',
  pending_max: 'You already have 3 payout requests being processed. Wait for one of them to be paid.',
  master: 'Made a Legend ✦',
  unlegend: 'Legend grade removed.',
  amb_deleted: 'Ambassador deleted.',
  tree_hidden: 'Hidden from the tree. Nothing else changed: their account, mails and commissions are untouched.',
  tree_shown: 'Back in the tree.',
  amb_refused: 'This ambassador cannot be deleted.',
  short_deleted: 'Ambassador deleted everywhere.',
  short_pending: 'Ambassador removed from the site. Their Smart Mail account will be erased as soon as Smart Mail is updated.',
  master_refused: 'Only a Legend can make someone of their branch a Legend.',
};

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency, minimumFractionDigits: 2 }).format(cents / 100);
const day = (v: string | Date | null) => (v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Europe/Paris' }) : '—');
const short = (first: string, last: string) => `${first} ${last ? `${last[0]}.` : ''}`.trim();
const STATUS: Record<string, string> = { paid: 'Paid', held: 'Paying now', expired: 'Did not pay', canceled: 'Did not pay', failed: 'Did not pay' };

export default async function TeamConsole({ user, params }: { user: User; params: Params }) {
  const amb = await ensureAmbassador(user.id);
  // Schools, students and the team now sit on the overview; their old addresses lead there.
  // Plus aucun montant dans l'espace ambassadeur (18/11) : l'onglet Earnings ramène à l'aperçu.
  const tab = 'overview';
  const msg = MESSAGES[String(params.msg ?? '')];
  const inviteUrl = `${BASE()}/${amb.invite_code}`;
  // Page plein écran LinkedIn (26/11) : à chaque arrivée tant que le LinkedIn ne prospecte pas, sauf « Not now » (?ensuite=1).
  // L'admin la voit en aperçu avec ?apercu=page (et ?voir= pour celle d'un ambassadeur).
  const voir = typeof params.voir === 'string' ? params.voir : undefined;
  // Jamais au retour d'une action (?msg=…, virement, coordonnées bancaires…) : l'ambassadeur doit voir sa confirmation.
  // L'admin (26/11, « sur Ambassador view aussi ») arrive lui aussi sur la page, en aperçu, dans les mêmes cas qu'un
  // ambassadeur sans LinkedIn relié (ou celui choisi avec ?voir=) ; « Not now » le mène à la vue ambassadeur habituelle.
  const arrival = params.ensuite !== '1' && !params.msg;
  const gate = user.role === 'ambassador'
    ? arrival && !!(await linkedInGate(user.id))
    : user.role === 'admin' && (params.apercu === 'page' || (arrival && !!(await linkedInGate(voir ?? '00000000-0000-0000-0000-000000000000'))));

  return (
    <div className="cx" lang="en">
      {user.role === 'admin' ? (
        <>
          {/* An admin looking at the ambassador space keeps the /admin header (no tab bar: one section only, 19/11). */}
          <AdminHeader admin={user} view="ambassador" />
        </>
      ) : (
        <TeamHeader user={user} tab={tab} />
      )}
      {gate ? (
        <AmbLinkedInGate userId={user.role === 'admin' ? voir ?? '00000000-0000-0000-0000-000000000000' : user.id} preview={user.role === 'admin'} voir={voir} />
      ) : (
      <main id="main" className="container cx-main">
        {/* Prospecter avec son LinkedIn (26/11) : la carte de l'ambassadeur ; l'admin en voit l'aperçu (et celle de chacun). */}
        {user.role === 'ambassador' && <AmbProspection userId={user.id} msg={String(params.msg ?? '')} />}
        {user.role === 'admin' && <AmbProspectionPreview voir={voir} />}
        {/* Solde, retrait, commissions et virements de CHAQUE ambassadeur (26/11) : toujours là, en haut de l'espace, dès
            l'arrivée depuis Smart Mail, même à 0. L'admin y voit le même bloc (le sien) et le lien pour saisir les commissions. */}
        <div id="earnings" className="cx-anchor">
          {msg && <p className="price-alert" role="status">{msg}</p>}
          {user.role === 'admin' && (
            <p className="help" lang="fr">
              Ce bloc est celui que chaque ambassadeur voit en haut de son espace. Les montants se saisissent dans{' '}
              <a href={`/${PRIVATE_SLUGS.admin}?tab=commissions`}>Admin › Commissions</a>.
            </p>
          )}
          <Earnings userId={user.id} amb={amb} />
        </div>
        {tab === 'overview' && <Overview user={user} inviteUrl={inviteUrl} />}
      </main>
      )}
    </div>
  );
}

async function Overview({ user, inviteUrl }: { user: User; inviteUrl: string }) {
  // Espace ambassadeur (20/11) : uniquement le réseau, comme sur la session de Pierre.
  const tree = await loadTree(user);
  return <NetworkCard user={user} tree={tree} inviteUrl={inviteUrl} />;
}

async function Schools({ userId }: { userId: string }) {
  const mine = await sql(
    `select u.id, u.name, u.state, c.claimed_at,
       (select count(*)::int from registrations r where r.university_id = u.id and r.status = 'paid' and r.paid_at >= c.claimed_at) as paid
     from school_claims c join universities u on u.id = c.university_id where c.user_id = $1 order by u.name`,
    [userId],
  );
  const free = await freeSchools();
  const [pending] = await sql(
    `select coalesce(u.name, sr.new_name) as name from school_requests sr left join universities u on u.id = sr.university_id
     where sr.user_id = $1 and sr.status = 'pending' limit 1`,
    [userId],
  );
  return (
    <>
      <section className="cx-card">
        <h2>Your schools <small>({mine.length})</small></h2>
        <div className="cx-scroll">
        <table className="cx-table">
          <thead><tr><th>School</th><th>Yours since</th><th className="num">Paid students</th></tr></thead>
          <tbody>
            {mine.map((s) => (
              <tr key={s.id}><td><strong>{s.name}</strong>{s.state && <small>{s.state}</small>}</td><td>{day(s.claimed_at)}</td><td className="num">{s.paid}</td></tr>
            ))}
            {mine.length === 0 && <tr><td colSpan={3} className="empty">No school yet.</td></tr>}
          </tbody>
        </table>
        </div>
      </section>
      <section className="cx-card">
        {/* One school per ambassador: the first is taken at once, another one is asked for and decided by The AI Certification.
            Asking for another one stays folded until opened. */}
        <details className="cx-fold" open={mine.length === 0}>
          <summary><h2>{mine.length === 0 ? 'Choose your school' : 'Ask for another school'}</h2></summary>
          {pending ? (
            <p className="price-alert" role="status">
              Your request for <strong>{pending.name}</strong> is being reviewed. You will see the school here once it is accepted.
            </p>
          ) : (
            <>
              <p className="help">
                {mine.length === 0
                  ? `Pick the school you represent. ${free.length} schools are still free.`
                  : 'Each ambassador holds one school. To represent another one, send a request: The AI Certification reviews it and gives you the school if it is still free.'}
              </p>
              <form className="form" action={claimSchoolAction}>
                <UniversityPicker schools={free.map((s) => ({ id: s.id, name: s.name, state: s.state ?? '' }))} allowAdd />
                <div><button className="btn btn-sm btn-green" type="submit">{mine.length === 0 ? 'Take this school' : 'Send my request'}</button></div>
              </form>
            </>
          )}
        </details>
      </section>
    </>
  );
}

async function Students({ userId }: { userId: string }) {
  const rows = await sql(
    `select r.id, r.first_name, r.last_name, r.created_at, r.paid_at, r.amount_cents, r.currency,
       case when r.status = 'held' and r.hold_expires_at <= now() then 'expired' else r.status end as status,
       u.name as school, owner.first_name as via, c.user_id = $1 as mine,
       cm.amount_cents as earned
     from registrations r
     join universities u on u.id = r.university_id
     join school_claims c on c.university_id = r.university_id
     join ambassadors a on a.user_id = c.user_id
     join users owner on owner.id = c.user_id
     left join commissions cm on cm.registration_id = r.id and cm.user_id = $1
     where c.user_id = $1 or a.parent_user_id = $1
        or a.parent_user_id in (select user_id from ambassadors where parent_user_id = $1)
     order by r.created_at desc limit 500`,
    [userId],
  );
  return (
    <section className="cx-card">
      <h2>{rows.length} student{rows.length === 1 ? '' : 's'}</h2>
      <div className="cx-scroll">
        <table className="cx-table">
          <thead><tr><th>Student</th><th>School</th><th>Registered</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><strong>{short(r.first_name, r.last_name)}</strong>{!r.mine && <small>via {r.via}</small>}</td>
                <td>{r.school}</td>
                <td>{day(r.created_at)}</td>
                <td><span className={`cx-badge tone-${r.status === 'paid' ? 'ok' : r.status === 'held' ? 'warn' : 'muted'}`}>{STATUS[r.status] ?? r.status}</span></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="empty">No student yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

async function Earnings({ userId, amb }: { userId: string; amb: Record<string, any> }) {
  // Balance per currency (22/11): earned minus payouts asked for or paid; the ambassador withdraws any amount of it.
  const balances = await payoutBalances(userId);
  // Lignes saisies par l'admin (24/11, sans vente rattachée, avec une note) et anciennes lignes nées d'une vente ; une
  // ligne annulée ne compte plus et n'est plus montrée.
  const lines = await sql(
    `select cm.*, r.first_name, r.last_name, u.name as school
     from commissions cm left join registrations r on r.id = cm.registration_id left join universities u on u.id = r.university_id
     where cm.user_id = $1 and cm.status <> 'cancelled' order by cm.created_at desc limit 500`,
    [userId],
  );
  const payouts = await sql('select * from payouts where user_id = $1 order by requested_at desc', [userId]);
  // Zero is shown in the ambassador's own currency (a US school earns in dollars), euros when nothing yet.
  const zero = money(0, balances[0]?.currency ?? 'EUR');
  const sum = (k: 'available' | 'requested' | 'paid') =>
    balances.filter((b) => b[k] > 0).map((b) => money(b[k], b.currency)).join(' · ') || zero;
  const withdrawable = balances.filter((b) => b.available > 0);
  const first = withdrawable[0];
  const iban = String(amb.iban ?? '');
  const maskedIban = iban ? `${iban.slice(0, 4)} •••• •••• ${iban.slice(-4)}` : '';

  return (
    <>
      <div className="cx-kpis">
        <div className="cx-kpi"><span>Available</span><strong>{sum('available')}</strong></div>
        <div className="cx-kpi"><span>Payout requested</span><strong>{sum('requested')}</strong></div>
        <div className="cx-kpi"><span>Paid to you</span><strong>{sum('paid')}</strong></div>
      </div>

      <section className="cx-card cx-payout">
        <div className="cx-payout-main">
          <span className="eyebrow">Your payout</span>
          <strong className="cx-payout-amount">{sum('available')}</strong>
          <p className="help">
            Choose how much to withdraw, up to what is available: we send it to your bank account by transfer within 48 hours.
          </p>
          {iban && first ? (
            <form action={requestPayoutAction} className="form cx-payout-form">
              <div className="field">
                <label htmlFor="p-amount">Amount to withdraw{withdrawable.length === 1 ? ` (${first.currency})` : ''}</label>
                <div className="cx-payout-row">
                  <input id="p-amount" name="amount" type="number" inputMode="decimal" min="0.01" step="0.01"
                    max={(first.available / 100).toFixed(2)} defaultValue={(first.available / 100).toFixed(2)} required />
                  {withdrawable.length > 1 ? (
                    <select name="currency" aria-label="Currency" defaultValue={first.currency}>
                      {withdrawable.map((b) => <option key={b.currency} value={b.currency}>{b.currency} · up to {money(b.available, b.currency)}</option>)}
                    </select>
                  ) : (
                    <input type="hidden" name="currency" value={first.currency} />
                  )}
                </div>
              </div>
              <div><button className="btn btn-green" type="submit">Ask for this payout</button></div>
            </form>
          ) : (
            // Toujours cliquable (26/11) : sans IBAN ou sans solde, la réponse dit quoi faire (no_iban / nothing).
            <form action={requestPayoutAction} className="form cx-payout-form">
              <input type="hidden" name="currency" value={balances[0]?.currency ?? 'EUR'} />
              <input type="hidden" name="amount" value="0" />
              <div><button className="btn btn-green" type="submit">Ask for a payout</button></div>
            </form>
          )}
          {!iban && <p className="help">Add your bank account first.</p>}
          {iban && !first && <p className="help">Nothing available to withdraw right now.</p>}
        </div>
        <div className="cx-payout-bank">
          <h3>Bank account</h3>
          {iban && (
            <div className="cx-bank-saved">
              <strong>{amb.iban_holder}</strong>
              <code>{maskedIban}</code>
            </div>
          )}
          {iban ? (
            <details className="cx-setting-edit">
              <summary className="btn btn-sm">Change</summary>
              <BankForm holder={amb.iban_holder ?? ''} iban={iban} />
            </details>
          ) : (
            <BankForm holder="" iban="" />
          )}
        </div>
      </section>

      <section className="cx-card">
        <h2>Commissions</h2>
        <p className="help">Your commissions are added here by The AI Certification. You can withdraw them whenever you want.</p>
        <div className="cx-scroll">
          <table className="cx-table">
            <thead><tr><th>Date</th><th>Commission</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <td>{day(l.created_at)}</td>
                  <td>
                    {l.registration_id ? (
                      <><strong>{short(l.first_name ?? '', l.last_name ?? '') || 'Student'}</strong><small>{[l.school, `${l.rate_bp / 100} %${l.level === 2 ? ' (your invitee)' : l.level === 3 ? ' (2nd level)' : ''}`].filter(Boolean).join(' · ')}</small></>
                    ) : (
                      <strong>{l.label || 'Commission'}</strong>
                    )}
                  </td>
                  <td className="num">{money(l.amount_cents, l.currency)}</td>
                </tr>
              ))}
              {lines.length === 0 && <tr><td colSpan={3} className="empty">No commission yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {payouts.length > 0 && (
        <section className="cx-card">
          <h2>Payouts</h2>
          <div className="cx-scroll">
          <table className="cx-table">
            <thead><tr><th>Requested</th><th className="num">Amount</th><th>Status</th></tr></thead>
            <tbody>
              {payouts.map((p) => (
                <tr key={p.id}><td>{day(p.requested_at)}</td><td className="num">{money(p.amount_cents, p.currency)}</td><td>{p.status === 'paid' ? `Sent ${day(p.paid_at)}` : p.status === 'refused' ? 'Refused: the amount is back in your balance' : 'On its way (within 48 h)'}</td></tr>
              ))}
            </tbody>
          </table>
          </div>
        </section>
      )}
    </>
  );
}

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Node = Row & { children: Node[]; size: number };

/**
 * The network as a tree. An ambassador sees who invited them, then everyone below them, at every level;
 * an admin sees the whole network (ambassadors invited from the admin's link start a branch).
 */
async function loadTree(user: User) {
  const rows = await sql(
    `select a.user_id as id, a.parent_user_id as parent, a.created_at, u.first_name, u.last_name, u.role, lower(u.email) as email,
       a.master_by is not null as master,
       (select count(*)::int from short_ambassadors s where a.tool_code is not null and s.recruiter_code = a.tool_code and (s.active or s.sent > 0)) as shorts,
       -- L'école tenue par l'ambassadeur ; à défaut (compte ouvert depuis Smart Mail, aucune école encore prise), celle de son adresse d'école.
       coalesce(
         (select string_agg(un.name, ', ' order by un.name) from school_claims c join universities un on un.id = c.university_id where c.user_id = a.user_id),
         (select un.name from universities un, unnest(un.email_domains) d
           where split_part(lower(u.email), '@', 2) = lower(d) or split_part(lower(u.email), '@', 2) like '%.' || lower(d)
              or lower(d) like '%.' || split_part(lower(u.email), '@', 2)
           order by length(d) desc limit 1)) as schools,
       (select count(*)::int from registrations r join school_claims c on c.university_id = r.university_id where c.user_id = a.user_id and r.status = 'paid') as paid
     from ambassadors a join users u on u.id = a.user_id order by a.created_at`,
  );
  const earned = await sql(
    `select c.user_id as owner, cm.currency, sum(cm.amount_cents)::int as cents
     from commissions cm join registrations r on r.id = cm.registration_id join school_claims c on c.university_id = r.university_id
     where cm.user_id = $1 group by c.user_id, cm.currency`,
    [user.id],
  );
  const nodes = new Map<string, Node>(rows.map((r) => [String(r.id), { ...r, earned: earned.filter((e) => e.owner === r.id), children: [], size: 0 }]));
  const roots: Node[] = [];
  for (const n of nodes.values()) {
    if (n.id === user.id) continue;
    if (n.parent && nodes.has(n.parent)) nodes.get(n.parent)!.children.push(n);
    else if (user.role === 'admin' && n.role !== 'admin') roots.push(n);
  }
  // Une seule pyramide (23/11) : les ambassadeurs d'école sans compte sur le site y figurent aussi, sous celui dont ils
  // ont tapé le code (sinon sous le sommet, pour l'admin). Ceux qui ont un compte y sont déjà, une seule fois.
  const shortRows = await sql(
    `select s.smartmail_id, s.first_name, s.domain, s.recruiter_code, o.user_id as owner, s.master_by is not null as master,
       (select u.name from universities u, unnest(u.email_domains) d
         where s.domain = lower(d) or s.domain like '%.' || lower(d) or lower(d) like '%.' || s.domain order by length(d) desc limit 1) as school
     from short_ambassadors s left join ambassadors o on o.tool_code = s.recruiter_code and s.recruiter_code <> ''
     where (s.active or s.sent > 0)
       and not exists (select 1 from short_removed x where x.smartmail_id = s.smartmail_id)
       and not exists (select 1 from ambassadors a where a.smartmail_id = s.smartmail_id)`,
  );
  for (const r of shortRows) {
    const leaf: Node = { id: `sm-${r.smartmail_id}`, parent: r.owner ?? null, first_name: String(r.first_name || 'Ambassador').replace(/^./, (c: string) => c.toUpperCase()),
      last_name: '', role: 'short', schools: r.school ?? r.domain, paid: 0, master: Boolean(r.master), shorts: 0, earned: [], children: [], size: 0,
      // Un seul système d'ambassadeurs (23/11) : celui venu par Smart Mail commence Beginner, comme tout le monde.
      grade: r.master ? 'master' : 'dog' };
    const owner = r.owner ? nodes.get(String(r.owner)) : null;
    if (owner) owner.children.push(leaf);
    else if (user.role === 'admin') roots.push(leaf);
  }
  // Grades (19/11): people brought = ambassadors invited directly + Smart Mail ambassadors who entered your code.
  for (const n of nodes.values()) {
    n.brought = n.children.length; // les ambassadeurs d'école sont maintenant dans children (23/11)
    n.grade = gradeOf({ admin: n.role === 'admin', master: Boolean(n.master), brought: n.brought });
  }
  const me = nodes.get(user.id);
  // Pierre et Hippolyte sont le sommet (23/11) : leurs comptes d'école (ouverts par leur messagerie, via Smart Mail) ne sont
  // pas répétés en dessous ; ceux qu'ils ont amenés avec ces comptes se placent directement sous le sommet.
  const isFounder = (n: Node) => FOUNDER_EMAILS.includes(String(n.email ?? '')) || FOUNDER_SMARTMAIL.includes(String(n.id));
  // Masqués dans l'arbre par l'admin (23/11) : absents du dessin, ceux qu'ils ont amenés remontent d'un cran. Rien d'autre.
  const hiddenIds = new Set((await sql('select target_id from tree_hidden')).map((r) => String(r.target_id)));
  const hidden: { id: string; name: string; school: string }[] = [];
  const prune = (list: Node[]): Node[] => list.flatMap((n) => {
    n.children = prune(n.children);
    if (!hiddenIds.has(String(n.id))) return [n];
    hidden.push({ id: String(n.id), name: `${n.first_name} ${n.last_name ?? ''}`.trim(), school: String(n.schools ?? '') });
    return n.children;
  });
  const top = prune(user.role === 'admin' ? roots.flatMap((n) => (isFounder(n) ? n.children : [n])) : me?.children ?? []);
  const grade = user.role === 'admin' ? ('master' as const) : me ? (me.grade as ReturnType<typeof gradeOf>) : ('dog' as const);
  const brought = Number(me?.brought ?? 0);
  // Sizes and paid students per branch (guarded against a loop in the data).
  const seen = new Set<string>();
  const measure = (n: Node): [number, number] => {
    if (seen.has(n.id)) return [0, 0];
    seen.add(n.id);
    let size = 0, paid = n.paid as number;
    for (const c of n.children) { const [s2, p2] = measure(c); size += 1 + s2; paid += p2; }
    n.size = size;
    return [size, paid];
  };
  let total = 0, paid = 0;
  for (const n of top) { const [s2, p2] = measure(n); total += 1 + s2; paid += p2; }
  const sponsor = me?.parent ? nodes.get(me.parent) : null;
  // Les noms donnés par celui qui regarde, pour lui seul (22/11).
  const aliases = new Map((await sql('select target_id, alias from ambassador_aliases where owner_id = $1', [user.id])).map((r) => [String(r.target_id), String(r.alias)]));
  for (const r of await sql('select smartmail_id, alias from short_aliases where owner_id = $1', [user.id])) aliases.set(`sm-${r.smartmail_id}`, String(r.alias));
  return { top, total, paid, grade, brought, aliases, hidden: user.role === 'admin' ? hidden : [], // Invité par le lien admin (pas de parrain enregistré) : c'est Pierre et Hippolyte qu'il voit au-dessus (20/11).
    sponsor: sponsor ? `${sponsor.first_name} ${sponsor.last_name}`.trim() : me ? ADMIN_ROOT : null };
}

type Tree = Awaited<ReturnType<typeof loadTree>>;

function NetworkTree({ user, tree, inviteUrl }: { user: User; tree: Tree; inviteUrl: string }) {
  const admin = user.role === 'admin';
  const toPyramid = (n: Node, level: number): PyramidNode => ({
    id: String(n.id),
    name: tree.aliases.get(String(n.id)) ?? `${n.first_name} ${n.last_name}`.trim(),
    realName: `${n.first_name} ${n.last_name}`.trim(),
    canRename: true, // (23/11) aussi les ambassadeurs venus par Smart Mail
    school: n.schools ?? 'No school',
    paid: Number(n.paid),
    size: n.size,
    rate: 0,
    earned: (n.earned ?? []).map((e: { currency: string; cents: number }) => money(e.cents, e.currency)).join(' · '),
    grade: n.grade,
    canMaster: tree.grade === 'master' && n.grade !== 'master',
    // L'admin (22/11) : retirer Legend, supprimer l'ambassadeur.
    canUnlegend: admin && n.grade === 'master',
    canDelete: admin, // (23/11) « masquer dans l'arbre » : visuel seulement, pour tout le monde
    children: n.children.map((c) => toPyramid(c, level + 1)),
  });
  const root: PyramidNode = {
    id: user.id,
    name: admin ? ADMIN_ROOT : user.first_name || 'You',
    school: admin ? 'The AI Certification' : 'You',
    paid: tree.paid,
    size: tree.total,
    rate: 0,
    earned: '',
    grade: tree.grade,
    children: tree.top.map((n) => toPyramid(n, 1)),
  };
  return (
    <>
      <NetworkPyramid root={root} sponsor={admin ? null : tree.sponsor} viewerEarns={false} inviteUrl={inviteUrl} />
      {admin && tree.hidden.length > 0 && (
        <details className="tree-hidden">
          <summary>Hidden from the tree ({tree.hidden.length})</summary>
          <p className="help">Hidden people keep everything: account, mails, schools, commissions. Only the drawing leaves them out.</p>
          <ul>
            {tree.hidden.map((h) => (
              <li key={h.id}>
                <span><strong>{h.name || 'Ambassador'}</strong>{h.school ? <small> · {h.school}</small> : null}</span>
                <form action={showInTreeAction}><input type="hidden" name="target_id" value={h.id} /><button type="submit" className="btn btn-sm btn-ghost">Show again</button></form>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

/**
 * Long et court terme dans une seule carte (19/11) : deux onglets, chacun avec son nombre et une phrase qui dit la
 * différence. Bascule en CSS (boutons radio), sans JavaScript : le long terme est ouvert d'abord.
 */
async function NetworkCard({ user, tree, inviteUrl }: { user: User; tree: Tree; inviteUrl: string }) {
  // Une seule pyramide (23/11) : plus d'onglets Biz Dev / Ambassadors.
  return <NetworkTree user={user} tree={tree} inviteUrl={inviteUrl} />;
}

// Vue admin (18/11) : le sommet des deux arbres, c'est Pierre et Hippolyte.
const ADMIN_ROOT = 'Pierre et Hippolyte';
// Leurs messageries d'école dans Smart Mail (comptes 2 et 13 du premier serveur) : c'est eux, pas des ambassadeurs en dessous d'eux.
const FOUNDER_EMAILS = (process.env.FOUNDER_EMAILS ?? 'pierre.cazaban@ieseg.fr,hippolyte.constantin@ieseg.fr').split(',').map((s) => s.trim().toLowerCase());
const FOUNDER_SMARTMAIL = ['sm-2', 'sm-13'];

/**
 * Ambassadeurs « court terme » (18/11) : ceux qu'on consomme avec des mails (comptes Smart Mail). Chacun se place sous
 * l'ambassadeur dont il a tapé le code personnel à l'entrée du tool ; sans code personnel (code du jour), sous le sommet.
 * Un ambassadeur ne voit que les siens ; l'admin voit tout, sous Pierre et Hippolyte.
 */
async function loadShort(user: User) {
  const admin = user.role === 'admin';
  const myCode = await toolCodeOf(user.id);
  const all = await sql(
    `select s.smartmail_id, s.first_name, s.domain, s.sent, s.buyers, s.updated_at, s.recruiter_code,
       (select u.name from universities u, unnest(u.email_domains) d
         where s.domain = lower(d) or s.domain like '%.' || lower(d) or lower(d) like '%.' || s.domain order by length(d) desc limit 1) as school
     from short_ambassadors s where (s.active or s.sent > 0) and not exists (select 1 from short_removed x where x.smartmail_id = s.smartmail_id) order by s.buyers desc, s.sent desc`,
  );
  const codes = [...new Set(all.map((r) => String(r.recruiter_code)).filter(Boolean))];
  const owners = codes.length
    ? await sql(`select a.tool_code, a.user_id, u.first_name, u.last_name, u.role from ambassadors a join users u on u.id = a.user_id where a.tool_code = any($1::text[])`, [codes])
    : [];
  const ownerOf = new Map(owners.map((o) => [String(o.tool_code), o]));
  // (Les messageries d'école de Pierre et d'Hippolyte ne sont pas des ambassadeurs sous eux-mêmes : voir FOUNDER_SMARTMAIL.)
  const hiddenIds = new Set((await sql('select target_id from tree_hidden')).map((r) => String(r.target_id)));
  const rows = (admin ? all : all.filter((r) => r.recruiter_code === myCode))
    .filter((r) => !FOUNDER_SMARTMAIL.includes(`sm-${r.smartmail_id}`) && !hiddenIds.has(`sm-${r.smartmail_id}`));
  // Admin : sous le sommet directement ceux venus par le code du jour ou un code d'admin ; les autres, sous leur recruteur.
  const direct = rows.filter((r) => { const o = ownerOf.get(String(r.recruiter_code)); return !admin || !o || o.role === 'admin'; });
  const groups = admin
    ? [...new Set(rows.map((r) => String(r.recruiter_code)))]
        .map((c) => ownerOf.get(c)).filter((o): o is Record<string, any> => Boolean(o) && o!.role !== 'admin')
        .map((o) => ({ owner: o, list: rows.filter((r) => r.recruiter_code === o.tool_code) }))
    : [];
  return { rows, direct, groups, myCode };
}

function ShortTree({ user, short }: { user: User; short: Awaited<ReturnType<typeof loadShort>> }) {
  const admin = user.role === 'admin';
  const { direct, groups, myCode } = short;
  const capital = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Ambassador');
  const card = (r: Record<string, any>) => (
    <li key={r.smartmail_id} className="st-node">
      <span className="st-av">{capital(String(r.first_name))[0]}</span>
      <div><strong>{capital(String(r.first_name))}</strong><small>{r.school ?? r.domain}</small></div>
      {admin && <DeleteShortButton id={Number(r.smartmail_id)} name={capital(String(r.first_name))} />}
    </li>
  );
  return (
    <>
      <div className="st-tree">
        <div className="st-node st-root">
          <span className="st-av">{(admin ? 'P' : (user.first_name || 'Y')[0]).toUpperCase()}</span>
          <div><strong>{admin ? ADMIN_ROOT : user.first_name || 'You'}</strong></div>
        </div>
        <ul>
          {/* Le code à donner, en premier pour qu'on le voie tout de suite (22/11). */}
          <ShortInvite code={myCode} />
          {groups.map((g) => (
            <li key={g.owner.user_id} className="st-group">
              <div className="st-node st-owner">
                <span className="st-av">{String(g.owner.first_name || '?')[0].toUpperCase()}</span>
                <div><strong>{`${g.owner.first_name} ${g.owner.last_name}`.trim()}</strong><small>Biz Dev · {g.list.length} ambassador{g.list.length === 1 ? '' : 's'}</small></div>
              </div>
              <ul>{g.list.map(card)}</ul>
            </li>
          ))}
          {direct.map(card)}
        </ul>
      </div>
    </>
  );
}

const LEVEL_RATE = (level: number) => (level === 1 ? RATES.parent : level === 2 ? RATES.grandparent : 0);

// Bank account form: shown directly while no IBAN is saved, behind "Change" afterwards.
function BankForm({ holder, iban }: { holder: string; iban: string }) {
  return (
    <form className="form" action={saveBankAction}>
      <div className="field">
        <label htmlFor="b-holder">Account holder</label>
        <input id="b-holder" name="holder" defaultValue={holder} autoComplete="name" required />
      </div>
      <div className="field">
        <label htmlFor="b-iban">IBAN</label>
        <input id="b-iban" name="iban" defaultValue={iban} placeholder="FR76 3000 6000 0112 3456 7890 189" required />
      </div>
      <div><button className="btn btn-sm" type="submit">Save bank account</button></div>
    </form>
  );
}
