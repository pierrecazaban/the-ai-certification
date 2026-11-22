'use client';

import { useEffect, useState } from 'react';
import { outreachPauseAction } from '@/lib/privateActions';

// Side panel of /admin › Prospection: refreshes every 10 seconds so you can watch the LinkedIn agent work.
type Live = {
  paused: boolean; target: number; listed: number; schoolsFull: number; schools: number;
  today: { invites: number; messages: number; reposts: number; invitesWeek: number }; invitesPerDay: number; weeklyCap: number;
  funnel: { invited: number; accepted: number; messaged: number; booked: number };
  totals: { invited: number; accepted: number; linked: number; contacts: number; booked: number; declined: number; accepted_today: number };
  invitesLeftToday: number; messagesPerDay: number; messagesWaiting: number;
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
  const t = d.totals;
  const rate = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : '—');
  // Refait le 22/11 : aujourd'hui en clair (envoyé / prévu, ce qui reste), puis le total depuis le début, sans journal.
  return (
    <aside className="cx-card ol-panel" aria-live="polite">
      <div className="ol-head">
        <h2>En direct</h2>
        <span className={`cx-badge ${d.paused ? 'tone-muted' : running ? 'tone-ok' : 'tone-info'}`}>
          {d.paused ? 'En pause' : running ? '● Agent actif' : 'En attente'}
        </span>
        {/* Pause / reprise, venue du bloc « LinkedIn prospection » retiré (22/11). */}
        <form action={outreachPauseAction} style={{ margin: 0 }}>
          <button className={`btn btn-sm ${d.paused ? 'btn-green' : ''}`} type="submit">{d.paused ? 'Reprendre' : 'Pause'}</button>
        </form>
      </div>
      <p className="help ol-last">Dernière action {ago(d.lastAt)}</p>

      <h3 className="ol-sub">Aujourd’hui</h3>
      <div className="ol-today">
        <div>
          <span className="ol-big">{d.today.invites}<small> / {d.today.invites + d.invitesLeftToday}</small></span>
          <span className="ol-lab">invitations envoyées</span>
          <Bar value={d.today.invites} max={d.today.invites + d.invitesLeftToday} />
          <span className="ol-note">{d.paused ? 'En pause : rien ne part' : d.invitesLeftToday ? `Encore ${d.invitesLeftToday} à inviter aujourd’hui` : 'Quota du jour atteint'}</span>
        </div>
        <div>
          <span className="ol-big">{d.today.messages}<small> / {d.messagesPerDay}</small></span>
          <span className="ol-lab">messages envoyés</span>
          <Bar value={d.today.messages} max={d.messagesPerDay} />
          <span className="ol-note">{d.messagesWaiting} accepté(s) attendent leur message</span>
        </div>
      </div>
      <p className="help ol-week">{d.today.invitesWeek} / {d.weeklyCap} invitations sur 7 jours · {t.accepted_today} acceptation(s) aujourd’hui</p>

      <h3 className="ol-sub">Depuis le début</h3>
      <ol className="ol-funnel">
        <li><b>{t.invited}</b><span>invités</span></li>
        <li><b>{t.accepted}</b><span>ont accepté <em>{rate(t.accepted, t.invited)}</em></span></li>
        <li><b>{t.contacts}</b><span>contacts obtenus</span></li>
      </ol>

      <h3 className="ol-sub">Liste à contacter</h3>
      <Bar value={d.listed} max={d.target} />
      <p className="help ol-week">{d.listed} / {d.target} étudiants trouvés · {d.schoolsFull} / {d.schools} écoles complètes (au moins un contact)</p>
      {d.toHandle > 0 && <p className="price-alert" style={{ margin: '10px 0 0' }}>{d.toHandle} conversation(s) à traiter par toi</p>}
    </aside>
  );
}
