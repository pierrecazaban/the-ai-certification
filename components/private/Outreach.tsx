import { leadContactedAction, outreachConfigAction, outreachContactedAction, outreachDeclineAction, outreachPauseAction } from '@/lib/privateActions';
import { budget, contacts, funnel, LIMITS, prospects, recentLog } from '@/lib/outreach';
import { leadCounts, leads } from '@/lib/ambassadorLeads';
import { leadLink, leadNetworkLabel } from '@/lib/leadNetworks';
import OutreachLive from '@/components/private/OutreachLive';
import OutreachVisual from '@/components/private/OutreachVisual';
import ProspectionPanel from '@/components/private/ProspectionPanel';
import { linkedinsWithContacts } from '@/lib/prospection';

// /admin › Prospection: the LinkedIn plan the script on the Mac follows, and where every prospect stands.
const STATUS: Record<string, { label: string; tone: string }> = {
  found: { label: 'Found', tone: 'muted' },
  invited: { label: 'Invited', tone: 'info' },
  accepted: { label: 'Accepted', tone: 'warn' },
  messaged: { label: 'Message sent', tone: 'info' },
  contact: { label: 'Contact reçu', tone: 'ok' },
  booked: { label: 'Call booked', tone: 'ok' },
  failed: { label: 'Failed', tone: 'muted' },
  declined: { label: 'Refusé', tone: 'muted' },
  withdrawn: { label: 'Invitation retirée', tone: 'muted' },
};
const MESSAGES: Record<string, string> = { declined: 'Noted: this student will never be contacted again.', saved: 'Plan saved: the script uses it on its next run.', contacted: 'Noté.', paused: 'Prospection paused.', resumed: 'Prospection resumed.' };
const when = (v: string | Date | null) => (v ? new Date(v).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

export default async function Outreach({ params }: { params: Record<string, string | string[] | undefined> }) {
  const [b, f, list, events, allGiven, wanting, answers, structured] = await Promise.all([budget(), funnel(), prospects(null, 150), recentLog(30), contacts(), leads(), leadCounts(), linkedinsWithContacts()]);
  // Les contacts relevés par l'agent depuis le 26/11 sont dans « Contacts donnés » (ProspectionPanel) : ici, ceux d'avant.
  const given = allGiven.filter((p) => !structured.has(p.linkedin));
  const todo = given.filter((p) => !p.contacted_at && p.status !== 'declined');
  const wantingTodo = wanting.filter((p) => !p.contacted_at);
  const c = b.config;
  const msg = MESSAGES[String(params.msg ?? '')];
  const rate = (a: number, z: number) => (z ? `${Math.round((a / z) * 100)} %` : '—');
  const reached = f.invited + f.accepted + f.messaged + f.booked + f.contact;

  return (
    <div className="ol-layout">
    <div className="ol-main">
      <ProspectionPanel params={params} />
      {/* Certifiés qui ont répondu oui à « Tu veux devenir ambassadeur ? », posée avant le certificat (24/11). */}
      <section className="cx-card" id="certifies">
        <h2>Certifiés intéressés {wantingTodo.length > 0 && <span className="cx-dot">{wantingTodo.length}</span>}</h2>
        <p className="help" style={{ marginTop: 0 }}>
          Question « Tu veux devenir ambassadeur ? » posée avant le certificat : {answers.yes} oui, {answers.no} non.
        </p>
        {wanting.length ? (
          <div style={{ overflowX: 'auto' }}>
            <table className="cx-table">
              <thead><tr><th>Certifié</th><th>École</th><th>Contact</th><th>Écoles citées</th><th>Note</th><th>Répondu le</th><th /></tr></thead>
              <tbody>
                {wanting.map((p) => {
                  const link = leadLink(p.network, p.handle);
                  return (
                    <tr key={p.user_id} style={p.contacted_at ? { opacity: 0.55 } : undefined}>
                      <td>{p.holder_name || '—'}<small>{p.email}</small></td>
                      <td>{p.school ?? '—'}</td>
                      <td>
                        {leadNetworkLabel(p.network)} :{' '}
                        {link ? <a href={link} target="_blank" rel="noopener noreferrer"><strong>{p.handle}</strong></a> : <strong>{p.handle}</strong>}
                      </td>
                      <td>{p.schools || '—'}</td>
                      <td>{p.rating != null ? `${p.rating}/5` : '—'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{when(p.answered_at)}</td>
                      <td>
                        <form action={leadContactedAction}>
                          <input type="hidden" name="user_id" value={p.user_id} />
                          <input type="hidden" name="done" value={p.contacted_at ? '0' : '1'} />
                          <button className={`btn btn-sm ${p.contacted_at ? 'btn-ghost' : 'btn-green'}`} style={p.contacted_at ? undefined : { whiteSpace: 'nowrap' }} type="submit">{p.contacted_at ? `Contacté le ${when(p.contacted_at)} · annuler` : 'C’est fait'}</button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="help">Personne pour l’instant : dès qu’un certifié répond oui et laisse son réseau social, il apparaît ici (et tu reçois un mail).</p>}
      </section>
      <section className="cx-card" id="contacts">
        <h2>Contacts d’avant le 26/11 {todo.length > 0 && <span className="cx-dot">{todo.length}</span>}</h2>
        {given.length ? (
          <div style={{ overflowX: 'auto' }}>
            <table className="cx-table">
              <thead><tr><th>Étudiant</th><th>École</th><th>Contact</th><th>Donné le</th><th /></tr></thead>
              <tbody>
                {given.map((p) => (
                  <tr key={p.linkedin} style={p.contacted_at ? { opacity: 0.55 } : undefined}>
                    <td><a href={p.linkedin} target="_blank" rel="noopener noreferrer">{p.name || p.linkedin}</a></td>
                    <td>{p.school}</td>
                    <td><strong>{p.contact}</strong></td>
                    <td>{when(p.contact_at)}</td>
                    <td>
                      <form action={outreachContactedAction}>
                        <input type="hidden" name="linkedin" value={p.linkedin} />
                        <input type="hidden" name="done" value={p.contacted_at ? '0' : '1'} />
                        <button className={`btn btn-sm ${p.contacted_at ? 'btn-ghost' : 'btn-green'}`} type="submit">{p.contacted_at ? `Contacté le ${when(p.contacted_at)} · annuler` : 'C’est fait'}</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="help">Aucun contact pour l’instant : dès qu’un étudiant donne son Insta, son WhatsApp ou autre sur LinkedIn, il apparaît ici (et tu reçois un mail).</p>}
      </section>
      <OutreachVisual />



    </div>
    <OutreachLive />
    </div>
  );
}
