import { prospectAccountAction, prospectContactAction, prospectSchoolAction, prospectSchoolAddAction, prospectSettingsAction } from '@/lib/prospectionActions';
import { accountsOverview, contactList, schoolBaseSummary } from '@/lib/prospection';
import { contactLink, NETWORK_LABEL, type ContactNetwork } from '@/lib/contactNormalize';
import { getConfig } from '@/lib/outreach';
import { sql } from '@/lib/db';

// /admin › Prospection (26/11) : les comptes qui prospectent (Pierre et les ambassadeurs), les contacts donnés, la base
// d'écoles qui grandit et la couverture. Rendu côté serveur, sans JavaScript. (Le registre des réponses n'est plus affiché
// depuis le 26/11 au soir, demande de Pierre : il reste dans la base et sert au contrôle de la nuit.)
const when = (v: unknown) => (v ? new Date(String(v)).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const ACCOUNT_STATUS: Record<string, { label: string; tone: string }> = {
  connecting: { label: 'Connexion en cours', tone: 'warn' }, active: { label: 'Actif', tone: 'ok' }, paused: { label: 'En pause', tone: 'warn' },
  stop_requested: { label: 'Arrêt demandé', tone: 'muted' }, stopped: { label: 'Arrêté', tone: 'muted' },
};
const CONTACT_STATUS: Record<string, { label: string; tone: string }> = {
  new: { label: 'Nouveau', tone: 'ok' }, verify: { label: 'À vérifier', tone: 'warn' }, contacted: { label: 'Écrit', tone: 'muted' }, invalid: { label: 'Invalide', tone: 'muted' },
};

export default async function ProspectionPanel({ params }: { params: Record<string, string | string[] | undefined> }) {
  const [accounts, contacts, base, config] = await Promise.all([accountsOverview(), contactList(undefined, 300), schoolBaseSummary(), getConfig()]);
  const picked = typeof params.compte === 'string' ? accounts.find((a) => a.id === params.compte) : undefined;
  const todo = contacts.filter((c) => c.status === 'new' || c.status === 'verify');

  return (
    <>

      <section className="cx-card" id="comptes">
        <h2>Comptes qui prospectent</h2>
        <p className="help" style={{ marginTop: 0 }}>
          Pierre et les ambassadeurs qui ont relié leur LinkedIn. Chaque école n’est prospectée que par un compte à la fois ; un étudiant n’est contacté que par le compte qui l’a trouvé.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table className="cx-table">
            <thead><tr><th>Compte</th><th>État</th><th className="num">Invitations (jour / 7 j)</th><th className="num">Acceptées</th><th className="num">Contacts</th><th>Écoles en cours</th><th>Dernier passage</th><th /></tr></thead>
            <tbody>
              {accounts.map((a) => {
                const st = ACCOUNT_STATUS[String(a.status)] ?? { label: String(a.status), tone: 'muted' };
                return (
                  <tr key={String(a.id)}>
                    <td>
                      <a href={`?tab=prospection&compte=${encodeURIComponent(String(a.id))}#comptes`}><strong>{a.id === 'pierre' ? 'Pierre' : String(a.name || 'Ambassadeur')}</strong></a>
                      <small>{a.id === 'pierre' ? 'ton compte' : String(a.email ?? '')}</small>
                    </td>
                    <td><span className={`cx-badge tone-${st.tone}`}>{st.label}</span>{a.reason ? <small>{String(a.reason)}</small> : null}</td>
                    <td className="num">{Number(a.invites_today)} / {Number(a.invites_week)}</td>
                    <td className="num">{Number(a.accepted)} / {Number(a.invited)}</td>
                    <td className="num">{Number(a.contacts)}</td>
                    <td>{String(a.schools ?? '') || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{when(a.last_pass_at)}</td>
                    <td>
                      {(a.status === 'active' || a.status === 'paused') && (
                        <form action={prospectAccountAction}>
                          <input type="hidden" name="id" value={String(a.id)} />
                          <input type="hidden" name="op" value={a.status === 'active' ? 'pause' : 'resume'} />
                          <button className="btn btn-sm btn-ghost" type="submit">{a.status === 'active' ? 'Mettre en pause' : 'Relancer'}</button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {picked && <AccountDetail id={String(picked.id)} name={picked.id === 'pierre' ? 'Pierre' : String(picked.name || 'Ambassadeur')} />}
        <form action={prospectSettingsAction} className="form" style={{ marginTop: 14, display: 'flex', gap: 14, alignItems: 'end', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" name="enabled" defaultChecked={config.ambEnabled === true} /> Prospection par les ambassadeurs en service
          </label>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="pr-max">Comptes d’ambassadeurs au plus</label>
            <input id="pr-max" name="max" type="number" min={0} max={50} defaultValue={config.ambMaxAccounts ?? 10} style={{ width: 90 }} />
          </div>
          <button className="btn btn-sm" type="submit">Enregistrer</button>
        </form>
      </section>


      <section className="cx-card" id="contacts">
        <h2>Contacts donnés {todo.length > 0 && <span className="cx-dot">{todo.length}</span>}</h2>
        {contacts.length ? (
          <div style={{ overflowX: 'auto' }}>
            <table className="cx-table">
              <thead><tr><th>Étudiant</th><th>Contact</th><th>Sa phrase</th><th>Compte</th><th>État</th><th /></tr></thead>
              <tbody>
                {contacts.map((c) => {
                  const link = contactLink(String(c.network), String(c.normalized));
                  const st = CONTACT_STATUS[String(c.status)] ?? { label: String(c.status), tone: 'muted' };
                  const done = c.status === 'contacted' || c.status === 'invalid';
                  return (
                    <tr key={String(c.id)} style={done ? { opacity: 0.55 } : undefined}>
                      <td><a href={String(c.linkedin)} target="_blank" rel="noopener noreferrer">{String(c.name || 'Profil')}</a><small>{String(c.school ?? '')}</small></td>
                      <td>
                        {NETWORK_LABEL[c.network as ContactNetwork] ?? String(c.network)} :{' '}
                        {link ? <a href={link} target="_blank" rel="noopener noreferrer"><strong>{String(c.value)}</strong></a> : <strong>{String(c.value)}</strong>}
                        {c.source === 'image' ? <small>lu sur une image</small> : null}
                      </td>
                      <td style={{ maxWidth: 320 }}><small>« {String(c.quote).slice(0, 220)} »</small></td>
                      <td>{c.account === 'pierre' ? 'Pierre' : String(c.account_name || 'Ambassadeur')}</td>
                      <td style={{ whiteSpace: 'nowrap' }}><span className={`cx-badge tone-${st.tone}`}>{st.label}</span><small>{when(c.created_at)}</small></td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {!done && <ContactButton id={String(c.id)} status="contacted" label="C’est fait" green />}
                        {c.status === 'verify' && <ContactButton id={String(c.id)} status="new" label="C’est bon" />}
                        {!done && <ContactButton id={String(c.id)} status="invalid" label="Invalide" />}
                        {done && <ContactButton id={String(c.id)} status="new" label="Annuler" />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="help">Aucun contact relevé par l’agent pour l’instant. Les contacts d’avant le 26/11 sont dans la liste plus bas.</p>}
      </section>

      <section className="cx-card" id="ecoles">
        <h2>Base d’écoles</h2>
        <p className="help" style={{ marginTop: 0 }}>
          Elle grandit chaque jour (découverte, écoles tapées par les élèves, Smart Mail) et ne s’arrête jamais : une école sans nouvel étudiant se repose 30 jours puis revient.
          Une école est couverte dès qu’un ambassadeur de l’école est connecté (Smart Mail ou espace ambassadeur) : elle n’est plus prospectée. Un contact donné par un de ses étudiants ne compte pas.
        </p>
        <p className="help">
          <strong>{base.counts.total}</strong> écoles · à prospecter : {base.counts['à prospecter']} · en cours : {base.counts['en cours']} · couvertes : {base.counts.couverte} ·
          au repos : {base.counts['au repos']} · en pause : {base.counts['en pause']}
        </p>
        <details className="cx-fold">
          <summary><h3 style={{ display: 'inline' }}>Écoles couvertes ({base.covered.length})</h3></summary>
          <div style={{ overflowX: 'auto' }}>
            <table className="cx-table">
              <thead><tr><th>École</th><th>Pourquoi</th><th /></tr></thead>
              <tbody>
                {base.covered.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td><small>{s.reason}</small></td>
                    <td>
                      {s.manual === true
                        ? <SchoolButton id={s.id} op="auto" label="Repasser en automatique" />
                        : <SchoolButton id={s.id} op="uncovered" label="La prospecter quand même" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
        <details className="cx-fold">
          <summary><h3 style={{ display: 'inline' }}>En cours de prospection ({base.active.length})</h3></summary>
          <ul className="help">
            {base.active.map((s) => <li key={s.id}>{s.name} · compte {s.account === 'pierre' ? 'Pierre' : s.account.slice(0, 12)} · {s.found} étudiants trouvés en {s.searches} recherches</li>)}
          </ul>
        </details>
        <details className="cx-fold">
          <summary><h3 style={{ display: 'inline' }}>Dernières écoles ajoutées</h3></summary>
          <ul className="help">
            {base.latest.map((s) => <li key={s.id}>{s.name}{s.city ? ` (${s.city})` : ''} · {s.source} · {when(s.added_at)} · {s.state}</li>)}
          </ul>
        </details>
        <form action={prospectSchoolAddAction} className="form" style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap', marginTop: 10 }}>
          <div className="field" style={{ margin: 0 }}><label htmlFor="ps-name">Ajouter une école</label><input id="ps-name" name="name" required minLength={3} placeholder="Nom de l’école" /></div>
          <div className="field" style={{ margin: 0 }}><label htmlFor="ps-city">Ville</label><input id="ps-city" name="city" placeholder="Ville" style={{ width: 140 }} /></div>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" name="covered" /> déjà couverte</label>
          <button className="btn btn-sm" type="submit">Ajouter</button>
        </form>
      </section>
    </>
  );
}

function ContactButton({ id, status, label, green = false }: { id: string; status: string; label: string; green?: boolean }) {
  return (
    <form action={prospectContactAction} style={{ display: 'inline' }}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button className={`btn btn-sm ${green ? 'btn-green' : 'btn-ghost'}`} type="submit">{label}</button>
    </form>
  );
}

function SchoolButton({ id, op, label }: { id: string; op: string; label: string }) {
  return (
    <form action={prospectSchoolAction} style={{ display: 'inline' }}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value={op} />
      <button className="btn btn-sm btn-ghost" type="submit">{label}</button>
    </form>
  );
}

/** One account: its schools now, and its students with where each one stands. */
async function AccountDetail({ id, name }: { id: string; name: string }) {
  const [schools, rows] = await Promise.all([
    sql(`select name, found, searches from prospect_schools where assigned_to = $1 order by name`, [id]),
    sql(`select linkedin, name, school, status, invited_at, accepted_at, messaged_at, contact from outreach_prospects where account = $1
          order by coalesce(messaged_at, accepted_at, invited_at, found_at) desc limit 150`, [id]),
  ]);
  return (
    <div className="cx-card" style={{ marginTop: 14 }}>
      <h3 style={{ marginTop: 0 }}>{name} : qui il doit contacter et où en est chacun</h3>
      <p className="help">Écoles en cours : {schools.length ? schools.map((s) => `${s.name} (${s.found} trouvés)`).join(', ') : 'aucune pour l’instant'}.</p>
      <div style={{ overflowX: 'auto' }}>
        <table className="cx-table">
          <thead><tr><th>Étudiant</th><th>École</th><th>Où il en est</th><th>Contact</th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={String(p.linkedin)}>
                <td><a href={String(p.linkedin)} target="_blank" rel="noopener noreferrer">{String(p.name || 'Profil')}</a></td>
                <td>{String(p.school ?? '')}</td>
                <td>{String(p.status)}<small>{p.messaged_at ? `message ${when(p.messaged_at)}` : p.accepted_at ? `acceptée ${when(p.accepted_at)}` : p.invited_at ? `invité ${when(p.invited_at)}` : ''}</small></td>
                <td>{String(p.contact ?? '') || '—'}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="empty">Personne encore pour ce compte.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
