'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from 'react';
import GradeBadge, { GradeIcon } from '@/components/private/GradeBadge';
import { GRADE_LABEL, GRADE_RULE, type Grade } from '@/lib/grades';
import { deleteAmbassadorAction, nameMasterAction, removeLegendAction, renameForMeAction } from '@/lib/privateActions';

// The ambassador network drawn as a pyramid: the top person, then each row below the one who invited them.
// SVG, so it stays sharp at any zoom. It opens on the whole pyramid (the more people, the further out), then you
// move around by zooming (pinch, Ctrl + wheel or the buttons, around the point aimed at) and dragging. No animation.
// A “+” under the viewer copies their invite link (19/11, with a small TAC-style celebration); whoever joins
// through it takes a place there.

export type PyramidNode = {
  id: string;
  name: string;
  school: string;
  paid: number;
  size: number;
  /** Commission the viewer earns on this person's school, in %, or 0. */
  rate: number;
  earned: string;
  /** Grade (19/11), shown as a badge on top of the card. */
  grade?: Grade;
  /** The viewer is a Master and may name this person Master. */
  canMaster?: boolean;
  /** The admin may take the Legend grade back (22/11). */
  canUnlegend?: boolean;
  /** The admin may delete this ambassador (22/11). */
  canDelete?: boolean;
  /** The viewer may rename this person for themselves (22/11); realName is their own name. */
  canRename?: boolean;
  realName?: string;
  children: PyramidNode[];
};

const W = 168; // card
const H = 64;
const GAP = 16; // between cards of a row
const ROW = 56; // between rows
const PAD = 16;
const MAX_ZOOM = 2.5;

type Placed = { node: PyramidNode; x: number; y: number; depth: number; parent?: Placed; invite?: boolean };
const INVITE_ID = '__invite';
// Width of each grade badge on the cards (uppercase, 10px).
const BADGE_W: Record<Grade, number> = { dog: 82, intermediate: 116, advanced: 92, master: 82 };
// Little logo stars that burst from the “+” when the link is copied: [dx, dy, white].
const SPARKS: [number, number, boolean][] = [[34, -4, false], [24, -26, true], [-2, -32, false], [-26, -22, true], [-32, 6, false], [-18, 28, true], [8, 32, false], [28, 22, true]];

export default function NetworkPyramid({ root, sponsor, viewerEarns, inviteUrl, invite = true }: { root: PyramidNode; sponsor?: string | null; viewerEarns: boolean; inviteUrl: string; invite?: boolean }) {
  // Tap on a grade badge (19/11): the ranks, from Legend down to Beginner, the tapped one highlighted.
  const [ranks, setRanks] = useState<Grade | null>(null);
  useEffect(() => {
    if (!ranks) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setRanks(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ranks]);
  // A Master taps someone of their branch to name them Master (19/11), after a confirmation.
  const [naming, startNaming] = useTransition();
  // Tap on someone (22/11): their actions in a small panel (make or unmake a Legend, delete), each confirmed.
  const [picked, setPicked] = useState<PyramidNode | null>(null);
  const act = (n: PyramidNode, kind: 'legend' | 'unlegend' | 'delete') => {
    const ask = kind === 'legend' ? `Make ${n.name} a Legend?` : kind === 'unlegend' ? `Take the Legend grade back from ${n.name}?`
      : `Delete ${n.name}? The people they invited move up one level, their schools become free.`;
    void ask; // plus de fenêtre du navigateur (22/11) : le panneau d'actions suffit comme confirmation
    if (naming) return;
    const form = new FormData();
    form.set('user_id', n.id);
    setPicked(null);
    startNaming(async () => { await (kind === 'legend' ? nameMasterAction : kind === 'unlegend' ? removeLegendAction : deleteAmbassadorAction)(form); });
  };
  const nameMaster = (n: PyramidNode) => setPicked(n);
  useEffect(() => {
    if (!picked) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPicked(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [picked]);
  // Tap on “Invite someone”: the link is copied at once; `copied` counts the taps so the animation replays each time.
  const [copied, setCopied] = useState(0);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);
  const copyInvite = async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      ok = true;
    } catch {
      // Older browsers: the hidden-field copy.
      const t = document.createElement('textarea');
      t.value = inviteUrl;
      t.setAttribute('readonly', '');
      t.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
      document.body.appendChild(t);
      t.select();
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      t.remove();
    }
    if (!ok) { window.prompt('Your invite link', inviteUrl); return; }
    setCopied((n) => n + 1);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(0), 2200);
  };
  const top = sponsor ? H + ROW : 0; // room for “invited by” above the root

  const { placed, width, height } = useMemo(() => {
    const out: Placed[] = [];
    let leaf = 0;
    let maxDepth = 0;
    const place = (n: PyramidNode, depth: number, parent?: Placed): Placed => {
      const p: Placed = { node: n, x: 0, y: top + depth * (H + ROW), depth, parent, invite: n.id === INVITE_ID };
      maxDepth = Math.max(maxDepth, depth);
      out.push(p);
      // The viewer's own row ends with a “+” slot: the next person they invite.
      const children = depth === 0 && invite ? [...n.children, { id: INVITE_ID, name: '', school: '', paid: 0, size: 0, rate: 0, earned: '', children: [] }] : n.children;
      const kids = children.map((c) => place(c, depth + 1, p));
      p.x = kids.length ? (kids[0].x + kids[kids.length - 1].x) / 2 : leaf++ * (W + GAP);
      return p;
    };
    place(root, 0);
    const w = Math.max(Math.max(leaf, 1) * (W + GAP) - GAP, W) + PAD * 2;
    const h = top + (maxDepth + 1) * (H + ROW) - ROW + PAD * 2;
    return { placed: out, width: w, height: h };
  }, [root, top, invite]);

  const box = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  // The frame is as tall as the pyramid needs at full width, between a small minimum and 70 % of the screen.
  const [boxH, setBoxH] = useState<number | undefined>(undefined);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  // The whole pyramid in view.
  const fitZoom = () => {
    const el = box.current;
    if (!el) return 1;
    return Math.min(1, (el.clientWidth - 4) / width, (el.clientHeight - 4) / height);
  };

  // Zooming keeps the aimed point still (in box pixels); applied once the new size is laid out.
  const anchor = useRef<{ cx: number; cy: number; sx: number; sy: number } | null>(null);
  const offset = (z: number) => {
    const el = box.current!;
    return { x: Math.max(0, (el.clientWidth - width * z) / 2), y: Math.max(0, (el.clientHeight - height * z) / 2) };
  };
  const zoomAt = (next: number, sx?: number, sy?: number) => {
    const el = box.current;
    if (!el) return;
    const z = zoomRef.current;
    const nz = Math.max(fitZoom(), Math.min(MAX_ZOOM, next));
    const px = sx ?? el.clientWidth / 2;
    const py = sy ?? el.clientHeight / 2;
    const o = offset(z);
    anchor.current = { cx: (el.scrollLeft + px - o.x) / z, cy: (el.scrollTop + py - o.y) / z, sx: px, sy: py };
    zoomRef.current = nz;
    setZoom(nz);
  };
  useLayoutEffect(() => {
    const el = box.current;
    const a = anchor.current;
    if (!el || !a) return;
    const o = offset(zoom);
    el.scrollLeft = a.cx * zoom + o.x - a.sx;
    el.scrollTop = a.cy * zoom + o.y - a.sy;
    anchor.current = null;
  }, [zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const big = Math.min(window.innerHeight * 0.7, 680);
    // The frame follows the pyramid's shape at full width (a wide one gets a low frame), never too low to zoom in.
    const atFit = height * Math.min(1, (el.clientWidth - 4) / width) + 8;
    setBoxH(Math.round(Math.max(Math.min(300, big), Math.min(big, atFit))));
  }, [width, height]);
  useEffect(() => { if (boxH) setZoom(fitZoom()); }, [boxH]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ctrl + wheel and trackpad pinch zoom around the pointer (a plain wheel scrolls the page as usual).
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(zoomRef.current * Math.exp(-e.deltaY / 200), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // The mouse drags the view. On a touch screen (19/11) one finger scrolls as usual (the pyramid when zoomed in,
  // otherwise the page, so the page never gets stuck on it) and two fingers pinch to zoom.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const travel = useRef(0); // how far the pointer moved: a tap opens the “+”, a drag does not
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const spread = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY) || 1;
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 1) travel.current = 0;
      if (e.touches.length === 2) {
        travel.current += 100;
        pinch.current = { dist: spread(e.touches), zoom: zoomRef.current };
      }
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinch.current) return;
      e.preventDefault();
      const [a, b] = [e.touches[0], e.touches[1]];
      const r = el.getBoundingClientRect();
      zoomAt(pinch.current.zoom * (spread(e.touches) / pinch.current.dist), (a.clientX + b.clientX) / 2 - r.left, (a.clientY + b.clientY) / 2 - r.top);
    };
    const onEnd = (e: TouchEvent) => { if (e.touches.length < 2) pinch.current = null; };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }); // eslint-disable-line react-hooks/exhaustive-deps
  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return; // touch: see above
    if (pointers.current.size === 0) travel.current = 0;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: zoomRef.current };
    }
  };
  const onMove = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    const prev = pointers.current.get(e.pointerId);
    const el = box.current;
    if (!prev || !el) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2 && pinch.current) {
      travel.current += 100;
      const [a, b] = [...pointers.current.values()];
      const r = el.getBoundingClientRect();
      zoomAt(pinch.current.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.dist), (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      return;
    }
    travel.current += Math.abs(e.clientX - prev.x) + Math.abs(e.clientY - prev.y);
    el.scrollLeft -= e.clientX - prev.x;
    el.scrollTop -= e.clientY - prev.y;
  };
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  const cut = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
  const rootX = placed[0]?.x ?? 0;

  return (
    <div className="py-wrap">
      <div className="py-tools">
        <button type="button" onClick={() => zoomAt(zoom / 1.4)} aria-label="Zoom out">−</button>
        <button type="button" onClick={() => zoomAt(zoom * 1.4)} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => setZoom(fitZoom())}>See everyone</button>
        <span className="py-zoom">{Math.round(zoom * 100)} %</span>
      </div>
      <div className="py-box" ref={box} style={boxH ? { height: boxH } : undefined} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={onUp}>
        <svg width={width * zoom} height={height * zoom} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Ambassador network">
          <defs>
            <linearGradient id="py-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#F3D58A" /><stop offset=".5" stopColor="#D4A74C" /><stop offset="1" stopColor="#B8862B" /></linearGradient>
            <linearGradient id="py-adv" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2B4A8C" /><stop offset="1" stopColor="#17274C" /></linearGradient>
            <linearGradient id="py-shine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#fff" stopOpacity=".7" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
          </defs>
          <g transform={`translate(${PAD},${PAD})`}>
            {sponsor && (
              <g>
                <rect x={rootX} y={0} width={W} height={H} rx={14} className="py-sponsor" />
                <text x={rootX + W / 2} y={26} textAnchor="middle" className="py-small">Invited by</text>
                <text x={rootX + W / 2} y={46} textAnchor="middle" className="py-name">{cut(sponsor, 20)}</text>
                <path d={`M${rootX + W / 2},${H} V${top}`} className="py-line" />
              </g>
            )}
            {placed.filter((p) => p.parent).map((p) => {
              const px = p.parent!.x + W / 2, py = p.parent!.y + H, cx = p.x + W / 2, mid = py + ROW / 2;
              return <path key={`l-${p.node.id}`} d={`M${px},${py} V${mid} H${cx} V${p.y}`} className="py-line" />;
            })}
            {placed.filter((p) => p.invite).map((p) => (
              <g key={INVITE_ID} transform={`translate(${p.x},${p.y})`} className={`py-invite${copied ? ' is-copied' : ''}`}
                onClick={() => travel.current < 8 && copyInvite()} role="button" tabIndex={0} aria-label="Copy your invite link"
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); copyInvite(); } }}>
                <rect width={W} height={H} rx={14} className="py-invite-box" />
                {copied ? (
                  <g key={copied}>
                    <circle cx={24} cy={H / 2} r={14} className="py-invite-ripple" />
                    <circle cx={24} cy={H / 2} r={14} className="py-invite-plus-c" />
                    <path d={`M17.5 ${H / 2 + 0.5} L22 ${H / 2 + 5} L30.5 ${H / 2 - 4.5}`} className="py-invite-check" />
                    <g transform={`translate(24,${H / 2})`}>
                      {SPARKS.map(([dx, dy, alt], k) => (
                        <path key={k} d="M0,-5 Q1,-1 5,0 Q1,1 0,5 Q-1,1 -5,0 Q-1,-1 0,-5Z" className={`py-spark${alt ? ' alt' : ''}`}
                          style={{ ['--dx' as string]: `${dx}px`, ['--dy' as string]: `${dy}px`, animationDelay: `${k * 25}ms` }} />
                      ))}
                    </g>
                    <text x={46} y={28} className="py-name">Link copied!</text>
                    <text x={46} y={45} className="py-small">Now send it to them</text>
                  </g>
                ) : (
                  <>
                    <circle cx={24} cy={H / 2} r={14} className="py-invite-plus-c" />
                    <text x={24} y={H / 2 + 6} textAnchor="middle" className="py-invite-plus">+</text>
                    <text x={46} y={28} className="py-name">Invite someone</text>
                    <text x={46} y={45} className="py-small">Tap to copy your link</text>
                  </>
                )}
              </g>
            ))}
            {placed.filter((p) => !p.invite).map((p) => {
              const n = p.node;
              const isRoot = p.depth === 0;
              const tone = (isRoot ? 'py-root' : !viewerEarns ? 'py-node' : n.rate ? 'py-node py-earn' : 'py-node py-far') + (n.grade === 'master' ? ' py-is-master' : n.grade === 'dog' ? ' py-is-dog' : '');
              const bw = n.grade ? BADGE_W[n.grade] : 0;
              return (
                <g key={n.id} transform={`translate(${p.x},${p.y})`} className={[(n.canMaster || n.canUnlegend || n.canDelete || n.canRename) && 'py-can-master', n.grade === 'dog' && 'py-dog-card'].filter(Boolean).join(' ') || undefined}
                  {...(n.canMaster || n.canUnlegend || n.canDelete || n.canRename ? {
                    role: 'button', tabIndex: 0, 'aria-label': `Actions for ${n.name}`,
                    onClick: () => travel.current < 8 && nameMaster(n),
                    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter') nameMaster(n); },
                  } : {})}>
                  <title>{`${n.name}${n.grade ? ` · ${GRADE_LABEL[n.grade]}` : ''}\n${n.school}${n.rate ? `\n${n.rate} % for you${n.earned ? ` (${n.earned})` : ''}` : ''}${n.canMaster || n.canDelete ? '\nTap for actions' : ''}`}</title>
                  <rect width={W} height={H} rx={14} className={tone} />
                  <circle cx={24} cy={H / 2} r={14} className="py-avatar" />
                  <text x={24} y={H / 2 + 5} textAnchor="middle" className="py-initial">{(n.name.trim()[0] ?? '?').toUpperCase()}</text>
                  <text x={46} y={24} className="py-name" style={isRoot && n.name.length > 14 ? { fontSize: 11.5 } : undefined}>{cut(n.name, isRoot ? 22 : 15)}</text>
                  <text x={46} y={42} className="py-small">{cut(n.school, 20)}</text>
                  {!isRoot && viewerEarns && n.rate > 0 && <text x={46} y={56} className="py-rate">{n.rate} % for you</text>}
                  {n.grade && (
                    // The grade, on the top edge of the card where the line from above arrives.
                    <g transform={`translate(${(W - bw) / 2},-11)`} className={`py-gb py-gb-${n.grade}`} role="button" tabIndex={0} aria-label="See the ranks"
                      onClick={(e) => { e.stopPropagation(); if (travel.current < 8) setRanks(n.grade!); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setRanks(n.grade!); } }}>
                      <clipPath id={`py-gbc-${n.id}`}><rect width={bw} height={22} rx={11} /></clipPath>
                      <rect width={bw} height={22} rx={11} className="py-gb-bg" />
                      {n.grade === 'master' && <g clipPath={`url(#py-gbc-${n.id})`}><rect width={34} height={22} x={-40} className="py-gb-shine" /></g>}
                      <g transform="translate(1,0)"><GradeIcon grade={n.grade} /></g>
                      <text x={24} y={15} className="py-gb-text">{GRADE_LABEL[n.grade]}</text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      {picked && (
        <div className="py-ranks" onClick={() => setPicked(null)}>
          <div className="py-ranks-card py-act-card" role="dialog" aria-modal="true" aria-label={picked.name} onClick={(e) => e.stopPropagation()}>
            <div className="py-ranks-head">
              <strong>{picked.name}</strong>
              <button type="button" className="py-ranks-x" aria-label="Close" onClick={() => setPicked(null)}>×</button>
            </div>
            {picked.grade && <p className="py-act-grade"><GradeBadge grade={picked.grade} /> <span>{picked.school}</span></p>}
            {picked.canRename && (
              <form className="py-rename" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); f.set('user_id', picked.id); setPicked(null); startNaming(async () => { await renameForMeAction(f); }); }}>
                <label htmlFor="py-alias">Name shown to you{picked.realName && picked.realName !== picked.name ? ` (their name: ${picked.realName})` : ''}</label>
                <div><input id="py-alias" name="alias" defaultValue={picked.name} maxLength={60} /><button type="submit" className="py-act">Save</button></div>
              </form>
            )}
            <div className="py-act-list">
              {picked.canMaster && <button type="button" className="py-act py-act-legend" onClick={() => act(picked, 'legend')}>✦ Make a Legend</button>}
              {picked.canUnlegend && <button type="button" className="py-act" onClick={() => act(picked, 'unlegend')}>Remove the Legend grade</button>}
              {picked.canDelete && <button type="button" className="py-act py-act-delete" onClick={() => act(picked, 'delete')}>Delete this ambassador</button>}
            </div>
          </div>
        </div>
      )}
      {ranks && (
        <div className="py-ranks" onClick={() => setRanks(null)}>
          <div className="py-ranks-card" role="dialog" aria-modal="true" aria-label="Ranks" onClick={(e) => e.stopPropagation()}>
            <div className="py-ranks-head">
              <strong>Ranks</strong>
              <button type="button" className="py-ranks-x" aria-label="Close" onClick={() => setRanks(null)}>×</button>
            </div>
            <ol className="py-ranks-list">
              {(['master', 'advanced', 'intermediate', 'dog'] as Grade[]).map((g) => (
                <li key={g} className={g === ranks ? 'is-on' : undefined}>
                  <GradeBadge grade={g} />
                  <span>{GRADE_RULE[g]}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
      <span className="py-sr" aria-live="polite">{copied ? 'Invite link copied' : ''}</span>
    </div>
  );
}
