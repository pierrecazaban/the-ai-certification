'use client';

import { useRef, useState } from 'react';

// Admin revenue per day, in the spirit of the Stripe app (scrub with the finger, the big figure follows),
// drawn as glass in the TAC colours.
export type RevenueDay = { key: string; short: string; long: string; cents: number; fee: number; n: number };

const fmt = (cents: number, currency: string, decimals = 2) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency, minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(cents / 100);
const compact = (cents: number, currency: string) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(cents / 100);

// Hand-drawn look: a seeded wobble so each bar keeps the same strokes from one render to the next.
function rnd(seed: number) {
  let t = seed + 0x6d2b79f5;
  return () => { t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const W = 300, H = 180; // drawing units of the chart
function sketchRect(x: number, y: number, w: number, h: number, seed: number) {
  const r = rnd(seed), j = (a: number) => (r() - 0.5) * a;
  const pts = [[x + j(2), y + j(2)], [x + w + j(2), y + j(2)], [x + w + j(1.5), y + h], [x + j(1.5), y + h]];
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let k = 1; k <= 4; k++) {
    const [ax, ay] = pts[k - 1], [bx, by] = pts[k % 4];
    d += ` Q${(ax + bx) / 2 + j(2.2)},${(ay + by) / 2 + j(2.2)} ${bx + j(0.8)},${by + j(0.8)}`;
  }
  return d;
}
function hatch(x: number, y: number, w: number, h: number, seed: number) {
  const r = rnd(seed * 7 + 3), lines: string[] = [];
  for (let c = -h; c < w; c += 6.5) {
    const x1 = x + c, y1 = y + h, x2 = x + c + h, y2 = y;
    lines.push(`M${x1 + (r() - 0.5) * 1.5},${y1 + (r() - 0.5) * 1.5} L${x2 + (r() - 0.5) * 1.5},${y2 + (r() - 0.5) * 1.5}`);
  }
  return lines.join(' ');
}

export default function RevenueBars({ days, currency, estimated }: { days: RevenueDay[]; currency: string; estimated: boolean }) {
  const [sel, setSel] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const last = days.length - 1;
  const i = sel ?? last;
  const d = days[i];
  const max = Math.max(1, ...days.map((x) => x.cents));

  const pick = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r || !r.width) return;
    setSel(Math.min(last, Math.max(0, Math.floor(((clientX - r.left) / r.width) * days.length))));
  };

  return (
    <div className="rv">
      <div className="rv-glow" aria-hidden="true" />
      <div className="rv-head">
        <span className="rv-head-label">Revenus du jour · après frais Stripe{estimated ? ' (est.)' : ''}</span>
        <strong className="rv-head-value">{fmt(d.cents - d.fee, currency)}</strong>
        <span className="rv-head-date"><i aria-hidden="true" />{d.long}{i === last ? ' · aujourd’hui' : ''}</span>
        <span className="rv-head-sub">{fmt(d.cents, currency)} avant frais · − {fmt(d.fee, currency)} Stripe · {d.n} vente{d.n > 1 ? 's' : ''}</span>
      </div>

      <div className="rv-plot" ref={box}
        onPointerDown={(e) => { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); pick(e.clientX); }}
        onPointerMove={(e) => { if (e.pointerType === 'mouse' || e.buttons) pick(e.clientX); }}
        role="slider" tabIndex={0} aria-label="Choisir un jour" aria-valuemin={0} aria-valuemax={last} aria-valuenow={i}
        aria-valuetext={`${d.long} : ${fmt(d.cents - d.fee, currency)} après frais`}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') { e.preventDefault(); setSel(Math.max(0, i - 1)); }
          if (e.key === 'ArrowRight') { e.preventDefault(); setSel(Math.min(last, i + 1)); }
        }}>
        <span className="rv-scale top">{compact(max, currency)}</span>
        <span className="rv-line-h" style={{ bottom: '92%' }} />
        <span className="rv-line-h" style={{ bottom: '46%' }} />
        <span className="rv-line-h" style={{ bottom: 0 }} />
        <svg className="rv-sketch" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          {days.map((x, k) => {
            const bw = (W / days.length) * 0.64, bx = (W / days.length) * (k + 0.18);
            const bh = Math.max((x.cents / max) * H * 0.92, x.cents ? 3 : 0), by = H - bh;
            if (!bh) return null;
            const seed = Number(x.key.replaceAll('-', '')) % 100000;
            return (
              <g key={x.key} className={k === i ? 'rv-sk sel' : 'rv-sk'}>
                <clipPath id={`rv-c${k}`}><path d={sketchRect(bx, by, bw, bh, seed)} /></clipPath>
                <path d={hatch(bx - 2, by - 2, bw + 4, bh + 4, seed)} clipPath={`url(#rv-c${k})`} className="rv-hatch" />
                <path d={sketchRect(bx, by, bw, bh, seed)} className="rv-ink" />
                <path d={sketchRect(bx, by, bw, bh, seed + 11)} className="rv-ink thin" />
              </g>
            );
          })}
        </svg>
      </div>
      <div className="rv-ends"><span>{days[0].short}</span><span>{days[last].short}</span></div>
    </div>
  );
}
