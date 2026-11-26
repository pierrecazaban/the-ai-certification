import { ambassadorProspection } from '@/lib/prospection';
import { contactLink, NETWORK_LABEL, type ContactNetwork } from '@/lib/contactNormalize';
import { ambContactAction, ambStopAction } from '@/lib/prospectionActions';
import AmbLinkedInConnect from '@/components/private/AmbLinkedInConnect';

// Espace ambassadeur (26/11) : prospecter avec son propre LinkedIn. L'ambassadeur donne son accord, se connecte à la
// vraie page LinkedIn affichée ici (serveur de Paris), puis voit ce que l'assistant fait en son nom et les contacts à
// recontacter. Il peut tout arrêter : sa connexion est alors effacée du serveur. Un <div>, pas une <section> : la règle
// du site sur téléphone (padding des sections) ne doit pas s'y appliquer.
const day = (v: unknown) => (v ? new Date(String(v)).toLocaleString('en-GB', { timeZone: 'Europe/Paris', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

// `preview` (26/11, demande de Pierre) : l'admin voit la carte telle que l'ambassadeur la voit, boutons inactifs.
export default async function AmbProspection({ userId, msg, preview = false }: { userId: string; msg?: string; preview?: boolean }) {
  const p = await ambassadorProspection(userId);
  if (!p.enabled && !p.account && !preview) return null;
  const acc = p.account;
  const status = acc?.status ?? 'none';

  return (
    <div className="cx-card" id="linkedin">
      <h2>Prospect with your LinkedIn</h2>
      {msg === 'lk_stopped' && <p className="price-alert" role="status">Stopped. Your LinkedIn connection is being erased from our server.</p>}

      {(status === 'none' || status === 'stopped') && (
        <>
          <p className="help" style={{ marginTop: 0 }}>
            Connect your LinkedIn and grow your network: your account prospects for you, and your prospects show up here.
          </p>
          {p.enabled ? <AmbLinkedInConnect mode="start" preview={preview} /> : <p className="help">Prospection with LinkedIn is paused for now.</p>}
        </>
      )}

      {status === 'connecting' && (
        <>
          <p className="help" style={{ marginTop: 0 }}>Your LinkedIn is not connected yet. Sign in to LinkedIn below to start.</p>
          <AmbLinkedInConnect mode="resume" preview={preview} />
          <StopButton preview={preview} />
        </>
      )}

      {status === 'paused' && (
        <>
          <p className="price-alert" role="status">Paused: {acc?.reason || 'safety stop'}. Nothing runs in your name until you sign in to LinkedIn again.</p>
          <AmbLinkedInConnect mode="resume" preview={preview} />
          <StopButton preview={preview} />
        </>
      )}

      {status === 'stop_requested' && <p className="help" style={{ marginTop: 0 }}>Stopping: your LinkedIn connection is being erased from our server.</p>}

      {(status === 'active' || status === 'paused') && p.stats && (
        <>
          {status === 'active' && (
            <p className="help" style={{ marginTop: 0 }}>
              Prospecting with {acc?.name || 'your LinkedIn'} since {day(acc?.connected_at)}. Today: {p.stats.invitesToday} of {p.limits.invitesPerDay} invitations ·
              this week: {p.stats.invitesWeek} · accepted so far: {p.stats.accepted} of {p.stats.invited}.
            </p>
          )}
          <h3>Contacts to write to</h3>
          {p.contacts.length ? (
            <div className="cx-scroll">
              <table className="cx-table">
                <thead><tr><th>Student</th><th>Contact</th><th>Given</th><th /></tr></thead>
                <tbody>
                  {p.contacts.map((c) => {
                    const link = contactLink(String(c.network), String(c.normalized));
                    const done = c.status === 'contacted' || c.status === 'invalid';
                    return (
                      <tr key={String(c.id)} style={done ? { opacity: 0.55 } : undefined}>
                        <td><a href={String(c.linkedin)} target="_blank" rel="noopener noreferrer"><strong>{String(c.name || 'Profile')}</strong></a><small>{String(c.school ?? '')}</small></td>
                        <td>
                          {NETWORK_LABEL[c.network as ContactNetwork] ?? String(c.network)}:{' '}
                          {link ? <a href={link} target="_blank" rel="noopener noreferrer"><strong>{String(c.value)}</strong></a> : <strong>{String(c.value)}</strong>}
                          {c.status === 'verify' && <small>to check: read their message on LinkedIn</small>}
                        </td>
                        <td>{day(c.created_at)}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {done ? <ContactButton id={String(c.id)} status="new" label="Undo" preview={preview} /> : (
                            <>
                              <ContactButton id={String(c.id)} status="contacted" label="Done" green preview={preview} />
                              <ContactButton id={String(c.id)} status="invalid" label="Does not work" preview={preview} />
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <p className="help">No contact yet. As soon as a student gives one, it shows up here.</p>}
          {p.replies.length > 0 && (
            <>
              <h3>Students who wrote back (last 14 days)</h3>
              <p className="help" style={{ marginTop: 0 }}>Answer them yourself on LinkedIn: the assistant never replies in your name.</p>
              <ul className="help">
                {p.replies.map((r) => <li key={String(r.linkedin)}><a href={String(r.linkedin)} target="_blank" rel="noopener noreferrer">{String(r.name || 'Profile')}</a> ({String(r.school ?? '')}) · {day(r.analyzed_at)}</li>)}
              </ul>
            </>
          )}
          {status === 'active' && <StopButton preview={preview} />}
        </>
      )}
    </div>
  );
}

function ContactButton({ id, status, label, green = false, preview = false }: { id: string; status: string; label: string; green?: boolean; preview?: boolean }) {
  if (preview) return <button className={`btn btn-sm ${green ? 'btn-green' : 'btn-ghost'}`} type="button" disabled>{label}</button>;
  return (
    <form action={ambContactAction} style={{ display: 'inline' }}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button className={`btn btn-sm ${green ? 'btn-green' : 'btn-ghost'}`} type="submit">{label}</button>
    </form>
  );
}

function StopButton({ preview = false }: { preview?: boolean }) {
  if (preview) return <div style={{ marginTop: 12 }}><button className="btn btn-sm btn-ghost" type="button" disabled>Stop and disconnect my LinkedIn</button></div>;
  return (
    <form action={ambStopAction} style={{ marginTop: 12 }}>
      <button className="btn btn-sm btn-ghost" type="submit">Stop and disconnect my LinkedIn</button>
    </form>
  );
}
