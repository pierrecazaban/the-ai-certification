'use client';

import { useEffect, useState } from 'react';

// Visual dashboard of /admin › Prospection: the funnel, 14 days of activity, and the map of the target schools.
// One hue per job: navy for counts, a gold ramp (light → dark) for “students found per school”. Refreshes every 15 s.
type Day = { day: string; invited: number; accepted: number };
type School = { school: string; listed: number; invited: number; accepted: number; booked: number };
export type Data = {
  target: number; listed: number; perSchool: number; schoolOrder: string[];
  funnel: { invited: number; accepted: number; messaged: number; booked: number; found: number; contact?: number };
  days: Day[]; schoolStats: School[];
};

const NAVY = '#17274C';
const GOLD = ['#ECEFF4', '#F6E7C1', '#EBCF8A', '#D4A74C', '#B8862B', '#8A6414']; // 0 … 5 students found
const short = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

function Tip({ tip }: { tip: { x: number; y: number; text: string } | null }) {
  if (!tip) return null;
  return <div className="ov-tip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>;
}

function Funnel({ d }: { d: Data }) {
  const f = d.funnel;
  const invited = f.invited + f.accepted + f.messaged + f.booked + (f.contact ?? 0);
  const accepted = f.accepted + f.messaged + f.booked;
  // Lien envoyé et appel réservé retirés (22/11) : plus d'actualité ; la dernière étape, ce sont les contacts obtenus.
  const steps: [string, number][] = [['Listés', d.listed], ['Invités', invited], ['Acceptés', accepted + (f.contact ?? 0)], ['Contacts', f.contact ?? 0]];
  const max = Math.max(1, d.target, d.listed);
  return (
    <div className="ov-funnel">
      {steps.map(([k, v], i) => (
        <div key={k} className="ov-row" title={`${k} : ${v}`}>
          <span className="ov-label">{k}</span>
          <div className="ov-track"><div className="ov-bar" style={{ width: `${Math.max(v ? 1.5 : 0, (v / max) * 100)}%` }} /></div>
          <span className="ov-val">{v}{i > 0 && steps[i - 1][1] ? <small> · {Math.round((v / steps[i - 1][1]) * 100)} %</small> : null}</span>
        </div>
      ))}
      <small className="help">Objectif : {d.target} étudiants listés</small>
    </div>
  );
}

function Bars({ days, field, title }: { days: Day[]; field: 'invited' | 'accepted'; title: string }) {
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const W = 420, H = 156, pad = { l: 26, r: 6, t: 18, b: 22 };
  const shown = new Set([0, 4, 9, days.length - 1]);
  const max = Math.max(5, ...days.map((x) => x[field]));
  const bw = (W - pad.l - pad.r) / days.length;
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const ticks = [0, Math.round(max / 2), max];
  return (
    <figure className="ov-chart" onMouseLeave={() => setTip(null)}>
      <figcaption>{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}, 14 derniers jours`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#E1E5EC" strokeWidth={1} />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="#6B7896">{t}</text>
          </g>
        ))}
        {days.map((x, i) => {
          const v = x[field];
          const h = H - pad.b - y(v);
          return (
            <g key={x.day}>
              {/* generous hit area */}
              <rect x={pad.l + i * bw} y={pad.t} width={bw} height={H - pad.t - pad.b} fill="transparent"
                onMouseMove={(e) => { const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect(); setTip({ x: e.clientX - r.left + 10, y: e.clientY - r.top - 30, text: `${short(x.day)} : ${v}` }); }} />
              {v > 0 && <path d={`M${pad.l + i * bw + 2} ${H - pad.b} V${y(v) + 3} q0 -3 3 -3 h${bw - 10} q3 0 3 3 V${H - pad.b} Z`} fill={NAVY} pointerEvents="none" />}
              {v > 0 && h > 14 && <text x={pad.l + i * bw + bw / 2} y={y(v) - 4} textAnchor="middle" fontSize="10" fill="#33405F">{v}</text>}
              {shown.has(i) && <text x={pad.l + i * bw + bw / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="#6B7896">{short(x.day)}</text>}
            </g>
          );
        })}
      </svg>
      <Tip tip={tip} />
    </figure>
  );
}

function Schools({ d }: { d: Data }) {
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const by = new Map(d.schoolStats.map((s) => [s.school, s]));
  const order = [...d.schoolOrder, ...d.schoolStats.map((s) => s.school).filter((s) => !d.schoolOrder.includes(s))];
  return (
    <figure className="ov-chart ov-schools" onMouseLeave={() => setTip(null)}>
      <figcaption>Les {d.schoolOrder.length} écoles cibles</figcaption>
      <div className="ov-grid">
        {order.map((name) => {
          const s = by.get(name) ?? { listed: 0, invited: 0, accepted: 0, booked: 0 };
          const n = Math.min(5, Math.round((s.listed / Math.max(1, d.perSchool)) * 5));
          return (
            <span key={name} className="ov-cell" style={{ background: GOLD[n] }} aria-label={`${name} : ${s.listed} listés`}
              onMouseMove={(e) => { const r = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect(); setTip({ x: e.clientX - r.left + 10, y: e.clientY - r.top + 14, text: `${name} · ${s.listed} listés · ${s.invited} invités · ${s.accepted} acceptés` }); }}>
            </span>
          );
        })}
      </div>
      <div className="ov-legend">
        <span>Étudiants trouvés :</span>
        {GOLD.map((c, i) => <span key={c} className="ov-key"><i style={{ background: c }} />{i === 5 ? `${d.perSchool}` : Math.round((i / 5) * d.perSchool)}</span>)}
        <span className="ov-key"><i style={{ background: GOLD[3] }}><b>✓</b></i>appel réservé</span>
      </div>
      <Tip tip={tip} />
    </figure>
  );
}

export default function OutreachVisual({ initial }: { initial?: Data }) {
  const [d, setD] = useState<Data | null>(initial ?? null);
  useEffect(() => {
    if (initial) return;
    let alive = true;
    const load = () => fetch('/api/admin/outreach-live', { cache: 'no-store' }).then((r) => r.json()).then((j) => { if (alive && !j.error) setD(j); }).catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => { alive = false; clearInterval(t); };
  }, [initial]);
  if (!d) return <section className="cx-card"><p className="help">Chargement du tableau de bord…</p></section>;
  return (
    <section className="cx-card ov">
      <h2>Tableau de bord</h2>
      <div className="ov-top">
        <figure className="ov-chart"><figcaption>Entonnoir</figcaption><Funnel d={d} /></figure>
        <div className="ov-pair">
          <Bars days={d.days} field="invited" title="Invitations par jour" />
          <Bars days={d.days} field="accepted" title="Acceptations par jour" />
        </div>
      </div>
      <Schools d={d} />
    </section>
  );
}
