import { outreachConfigAction, outreachPauseAction } from '@/lib/privateActions';
import { budget, funnel, LIMITS, prospects, recentLog } from '@/lib/outreach';

// /admin › Prospection: the LinkedIn plan the script on the Mac follows, and where every prospect stands.
const STATUS: Record<string, { label: string; tone: string }> = {
  found: { label: 'Found', tone: 'muted' },
  invited: { label: 'Invited', tone: 'info' },
  accepted: { label: 'Accepted', tone: 'warn' },
  messaged: { label: 'Link sent', tone: 'info' },
  booked: { label: 'Call booked', tone: 'ok' },
  failed: { label: 'Failed', tone: 'muted' },
};
const MESSAGES: Record<string, string> = { saved: 'Plan saved: the script uses it on its next run.', paused: 'Prospection paused.', resumed: 'Prospection resumed.' };
const when = (v: string | Date | null) => (v ? new Date(v).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

export default async function Outreach({ params }: { params: Record<string, string | string[] | undefined> }) {
  const [b, f, list, events] = await Promise.all([budget(), funnel(), prospects(null, 150), recentLog(30)]);
  const c = b.config;
  const msg = MESSAGES[String(params.msg ?? '')];
  const rate = (a: number, z: number) => (z ? `${Math.round((a / z) * 100)} %` : '—');
  const reached = f.invited + f.accepted + f.messaged + f.booked;

  return (
    <>
      <section className="cx-card">
        <div className="cx-toolbar">
          <h2 style={{ margin: 0 }}>LinkedIn prospection</h2>
          <form action={outreachPauseAction}>
            <button className={`btn btn-sm ${c.paused ? 'btn-green' : ''}`} type="submit">{c.paused ? 'Resume' : 'Pause'}</button>
          </form>
        </div>
        <p className="help">
          {c.paused ? 'Paused: the script does nothing until you resume.' : 'Running: the script on your Mac follows this plan every day (Mac on, prospection Chrome signed in to LinkedIn).'}
        </p>
        {msg && <p className="price-alert" role="status">{msg}</p>}
        <div className="cx-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginTop: 12 }}>
          {[
            ['Found', f.found + reached, 'students spotted'],
            ['Invited', reached, `${b.today.invites} today · ${b.today.invitesWeek}/${c.weeklyCap} this week`],
            ['Accepted', f.accepted + f.messaged + f.booked, `${rate(f.accepted + f.messaged + f.booked, reached)} of invited`],
            ['Link sent', f.messaged + f.booked, `${b.today.messages} today`],
            ['Calls booked', f.booked, `${rate(f.booked, f.messaged + f.booked)} of messaged`],
            ['Reposts today', b.today.reposts, `${c.repostPerDay} a day`],
          ].map(([k, v, s]) => (
            <div key={String(k)} className="card" style={{ padding: 14 }}>
              <small className="help">{k}</small>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{v}</div>
              <small className="help">{s}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="cx-card">
        <h2>Daily plan</h2>
        <p className="help">LinkedIn’s ceilings for a young account are built in: at most {LIMITS.invitesPerDay} invitations a day and {LIMITS.weeklyCap} a week. Each invitation carries the short note below; the message with the personal booking link goes once they accept.</p>
        <form action={outreachConfigAction} className="form">
          <div className="form-row">
            <div className="field"><label htmlFor="o-inv">Invitations a day (max {LIMITS.invitesPerDay})</label><input id="o-inv" name="invitesPerDay" type="number" min={0} max={LIMITS.invitesPerDay} defaultValue={c.invitesPerDay} /></div>
            <div className="field"><label htmlFor="o-week">Invitations a week (max {LIMITS.weeklyCap})</label><input id="o-week" name="weeklyCap" type="number" min={0} max={LIMITS.weeklyCap} defaultValue={c.weeklyCap} /></div>
          </div>
          <div className="form-row">
            <div className="field"><label htmlFor="o-msg">Messages a day after acceptance (max {LIMITS.messagesPerDay})</label><input id="o-msg" name="messagesPerDay" type="number" min={0} max={LIMITS.messagesPerDay} defaultValue={c.messagesPerDay} /></div>
            <div className="field"><label htmlFor="o-rep">AI reposts a day (max {LIMITS.repostPerDay})</label><input id="o-rep" name="repostPerDay" type="number" min={0} max={LIMITS.repostPerDay} defaultValue={c.repostPerDay} /></div>
          </div>
          <div className="form-row">
            <div className="field"><label htmlFor="o-per">Students to find per school (max {LIMITS.perSchool})</label><input id="o-per" name="perSchool" type="number" min={1} max={LIMITS.perSchool} defaultValue={c.perSchool} /></div>
            <div className="field"><label htmlFor="o-sea">LinkedIn searches a day (max {LIMITS.searchesPerDay})</label><input id="o-sea" name="searchesPerDay" type="number" min={0} max={LIMITS.searchesPerDay} defaultValue={c.searchesPerDay} /></div>
          </div>
          <p className="help">Target list: {c.schools.length} schools × {c.perSchool} = {c.schools.length * c.perSchool} students. At {c.weeklyCap} invitations a week, about {Math.ceil((c.schools.length * c.perSchool) / Math.max(1, c.weeklyCap))} weeks.</p>
          <div className="field">
            <label htmlFor="o-schools">Schools, in order (one per line: first-year students are searched school by school)</label>
            <textarea id="o-schools" name="schools" rows={8} defaultValue={c.schools.join('\n')} />
          </div>
          <div className="field">
            <label htmlFor="o-note">Invitation note (Premium, 280 characters max; {'{prenom}'} and {'{ecole}'} are replaced; empty = no note)</label>
            <textarea id="o-note" name="inviteNote" rows={3} maxLength={280} defaultValue={c.inviteNote} />
          </div>
          <div className="field">
            <label htmlFor="o-text">Message sent after acceptance ({'{prenom}'}, {'{ecole}'}, {'{lien}'} are replaced)</label>
            <textarea id="o-text" name="message" rows={4} defaultValue={c.message} />
          </div>
          <button className="btn btn-sm btn-green" type="submit">Save the plan</button>
        </form>
      </section>

      <section className="cx-card">
        <h2>Prospects</h2>
        {list.length ? (
          <div style={{ overflowX: 'auto' }}>
            <table className="cx-table">
              <thead><tr><th>Student</th><th>School</th><th>Status</th><th>Invited</th><th>Accepted</th><th>Link sent</th><th>Booking link</th></tr></thead>
              <tbody>
                {list.map((p) => {
                  const s = STATUS[p.status] ?? { label: p.status, tone: 'muted' };
                  return (
                    <tr key={p.linkedin}>
                      <td><a href={p.linkedin} target="_blank" rel="noopener noreferrer">{p.name || p.linkedin}</a><br /><small className="help">{String(p.headline).slice(0, 70)}</small></td>
                      <td>{p.school}</td>
                      <td><span className={`cx-badge tone-${s.tone}`}>{s.label}</span>{p.error && <><br /><small className="help">{p.error}</small></>}</td>
                      <td>{when(p.invited_at)}</td>
                      <td>{when(p.accepted_at)}</td>
                      <td>{when(p.messaged_at)}</td>
                      <td><small><a href={p.link} target="_blank" rel="noopener noreferrer">{p.link.replace(/^https:\/\//, '')}</a></small></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="help">No prospect yet: the script adds them on its next run.</p>}
      </section>

      <section className="cx-card">
        <h2>Script activity</h2>
        {events.length ? (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {events.map((e, i) => <li key={i}><small className="help">{when(e.at)} · {e.kind}</small> {e.text}</li>)}
          </ul>
        ) : <p className="help">Nothing yet.</p>}
      </section>
    </>
  );
}
