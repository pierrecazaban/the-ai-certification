'use client';

import { useEffect, useState } from 'react';

// Side panel of /admin › Prospection: refreshes every 10 seconds so you can watch the LinkedIn agent work.
type Live = {
  paused: boolean; target: number; listed: number; schoolsFull: number; schools: number;
  today: { invites: number; messages: number; reposts: number; invitesWeek: number }; invitesPerDay: number; weeklyCap: number;
  funnel: { invited: number; accepted: number; messaged: number; booked: number };
  lastAt: string | null; events: { kind: string; text: string; at: string }[]; toHandle: number;
};

const ago = (iso: string | null) => {
  if (!iso) return 'jamais';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  return s < 60 ? `il y a ${s} s` : s < 3600 ? `il y a ${Math.round(s / 60)} min` : `il y a ${Math.round(s / 3600)} h`;
};

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div style={{ height: 10, borderRadius: 99, background: '#E6EAF1', overflow: 'hidden', margin: '6px 0 2px' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: 'var(--gold-mid, #B8862B)', transition: 'width .6s' }} />
    </div>
  );
}

export default function OutreachLive() {
  const [d, setD] = useState<Live | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () => fetch('/api/admin/outreach-live', { cache: 'no-store' }).then((r) => r.json()).then((j) => { if (alive && !j.error) setD(j); }).catch(() => {});
    load();
    const a = setInterval(load, 10000);
    const b = setInterval(() => tick((n) => n + 1), 5000);
    return () => { alive = false; clearInterval(a); clearInterval(b); };
  }, []);
  if (!d) return <aside className="cx-card ol-panel"><p className="help">Chargement du suivi…</p></aside>;

  const running = !!d.lastAt && Date.now() - new Date(d.lastAt).getTime() < 5 * 60 * 1000;
  return (
    <aside className="cx-card ol-panel" aria-live="polite">
      <div className="cx-toolbar">
        <h2 style={{ margin: 0, fontSize: 18 }}>En direct</h2>
        <span className={`cx-badge ${d.paused ? 'tone-muted' : running ? 'tone-ok' : 'tone-info'}`}>
          {d.paused ? 'En pause' : running ? '● Agent actif' : 'En attente'}
        </span>
      </div>
      <p className="help" style={{ margin: '4px 0 14px' }}>Dernière action {ago(d.lastAt)}</p>

      <strong>Liste cible</strong>
      <Bar value={d.listed} max={d.target} />
      <small className="help">{d.listed} / {d.target} étudiants · {d.schoolsFull} / {d.schools} écoles complètes</small>

      <div style={{ marginTop: 14 }}><strong>Invitations aujourd’hui</strong></div>
      <Bar value={d.today.invites} max={d.invitesPerDay} />
      <small className="help">{d.today.invites} / {d.invitesPerDay} aujourd’hui · {d.today.invitesWeek} / {d.weeklyCap} cette semaine</small>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, margin: '14px 0' }}>
        {[['Acceptés', d.funnel.accepted + d.funnel.messaged + d.funnel.booked], ['Liens envoyés', d.funnel.messaged + d.funnel.booked],
          ['Appels réservés', d.funnel.booked], ['Messages aujourd’hui', d.today.messages]].map(([k, v]) => (
          <div key={String(k)} style={{ background: '#F7F8FA', borderRadius: 10, padding: '8px 10px' }}>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{v}</div><small className="help">{k}</small>
          </div>
        ))}
      </div>

      {d.toHandle > 0 && <p className="price-alert" style={{ margin: '0 0 12px' }}>{d.toHandle} conversation(s) à traiter par toi</p>}

      <strong>Dernières actions</strong>
      <ul className="ol-events">
        {d.events.map((e, i) => (
          <li key={i}>
            <small className="help">{ago(e.at)}</small>
            {e.kind === 'à traiter' ? <span className="cx-badge tone-warn" style={{ marginLeft: 6 }}>À traiter</span> : <small className="help"> · {e.kind}</small>}
            <div>{e.text}</div>
          </li>
        ))}
        {!d.events.length && <li className="help">Rien pour l’instant.</li>}
      </ul>
    </aside>
  );
}
