import Link from 'next/link';
import { availabilityAction, cancelCallAction, deleteWindowAction } from '@/lib/privateActions';
import { frDay, frTime, googleRedirectUri, googleStatus, upcomingBookings, windows } from '@/lib/calls';
import { setting } from '@/lib/settings';
import { siteUrl } from '@/lib/site';

// /admin › Calls: tell Claude when you are free, see the calls booked on /call with their video links.
const MESSAGES: Record<string, string> = {
  'no-key': 'Add the Claude API key in Settings first: it reads your availability.',
  ai: 'Claude could not read that. Rephrase, for example: “dispo mardi et jeudi 14h-18h”.',
  empty: 'Write when you are free.',
  'window-deleted': 'Window removed.',
  'call-canceled': 'Call cancelled (and removed from Google Calendar when connected).',
  'google-ok': 'Google Calendar connected: every new call gets its own Google Meet link.',
  'google-failed': 'Google did not confirm the connection. Try again.',
  'google-setup': 'Paste the Google OAuth client ID and secret in Settings first.',
};

export default async function Calls({ params }: { params: Record<string, string | string[] | undefined> }) {
  const msg = String(params.msg ?? '');
  const summary = String(params.summary ?? '');
  const [ws, bookings, google, meetLink, aiKey] = await Promise.all([windows(), upcomingBookings(), googleStatus(), setting('MEET_LINK'), setting('ANTHROPIC_API_KEY')]);
  const link = `${siteUrl()}/call`;

  return (
    <>
      <section className="cx-card">
        <div className="cx-toolbar">
          <h2 style={{ margin: 0 }}>Ambassador calls</h2>
          <Link className="btn btn-sm" href="/call" target="_blank">Open /call</Link>
        </div>
        <p className="help">
          Candidates book a 45-minute call on <code>{link}</code>. In LinkedIn messages, add their profile so you know who booked:{' '}
          <code>{link}?ref=thomas-vangelisti</code>.
        </p>
        {msg === 'ok' && summary && <p className="price-alert learn-pass" role="status">✓ {summary}</p>}
        {MESSAGES[msg] && <p className="price-alert" role="status">{MESSAGES[msg]}</p>}
      </section>

      <section className="cx-card">
        <h2>When are you free?</h2>
        <p className="help">Write it like you would say it. Claude turns it into slots for the next 3 weeks (Paris time).</p>
        {!aiKey && <p className="price-alert">The Claude API key is missing in Settings.</p>}
        <form action={availabilityAction} className="form">
          <div className="field">
            <label className="skip" htmlFor="avail">Availability</label>
            <textarea id="avail" name="text" rows={3} required placeholder="Ex. : dispo tous les mardis et jeudis 14h-18h, et samedi matin. Pas dispo le 20." style={{ minHeight: 90 }} />
          </div>
          <button className="btn btn-sm btn-green" type="submit">Update my availability</button>
        </form>
        <h3 style={{ marginTop: 20 }}>Open windows</h3>
        {ws.length ? (
          <table className="cx-table">
            <tbody>
              {ws.map((w) => (
                <tr key={w.id}>
                  <td style={{ textTransform: 'capitalize' }}>{frDay(w.starts_at)}</td>
                  <td>{frTime(w.starts_at)} – {frTime(w.ends_at)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <form action={deleteWindowAction}>
                      <input type="hidden" name="id" value={w.id} />
                      <button className="btn btn-sm btn-ghost" type="submit">Remove</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="help">No window yet: /call shows “no slot open”.</p>
        )}
      </section>

      <section className="cx-card">
        <h2>Booked calls</h2>
        {bookings.length ? (
          <table className="cx-table">
            <thead>
              <tr><th>When</th><th>Who</th><th>School</th><th>Video link</th><th /></tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id}>
                  <td style={{ textTransform: 'capitalize' }}>{frDay(b.starts_at)}, {frTime(b.starts_at)}</td>
                  <td>
                    {b.first_name} {b.last_name}
                    <br /><small><a href={`mailto:${b.email}`}>{b.email}</a>{b.linkedin && <> · <a href={b.linkedin} target="_blank" rel="noopener noreferrer">LinkedIn</a></>}</small>
                  </td>
                  <td>{b.school || '—'}</td>
                  <td style={{ wordBreak: 'break-all' }}><a href={b.meet_url} target="_blank" rel="noopener noreferrer">{b.meet_url.replace(/^https:\/\//, '')}</a></td>
                  <td style={{ textAlign: 'right' }}>
                    <form action={cancelCallAction}>
                      <input type="hidden" name="id" value={b.id} />
                      <button className="btn btn-sm btn-ghost" type="submit">Cancel</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="help">No call booked yet.</p>
        )}
      </section>

      <section className="cx-card">
        <div className="cx-toolbar">
          <h2 style={{ margin: 0 }}>Google Meet</h2>
          <span className={`cx-badge ${google.connected ? 'tone-ok' : 'tone-warn'}`}>{google.connected ? 'Connected' : 'Not connected'}</span>
        </div>
        {google.connected ? (
          <p className="help">Each call is added to your Google Calendar with its own Meet link, and Google emails the invitation to the candidate.</p>
        ) : (
          <>
            <p className="help">
              Until Google Calendar is connected, calls use {meetLink ? <>your fixed link <code>{meetLink}</code></> : 'a Jitsi room per call (no account needed)'}.
              To get a Google Meet link per call: in Google Cloud, enable the Google Calendar API, create an OAuth client (Web application) with the
              redirect URI <code>{googleRedirectUri()}</code>, paste its ID and secret in Settings, then click below in your usual browser.
            </p>
            {google.configured && <p><a className="btn btn-sm btn-green" href="/api/google/connect">Connect Google Calendar</a></p>}
          </>
        )}
      </section>
    </>
  );
}
