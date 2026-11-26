'use client';

// Le tuto pas à pas de l'exercice Make du module 3 (26/11) : une frise des huit étapes, dessinée comme un scénario de
// Make, puis une étape à la fois, avec les écrans reproduits (en jaune ce qu'il faut remplir, numéroté comme les
// consignes), ce qu'on doit voir, et les blocages courants. Données : lib/learning/makeTutorial.ts.
// L'étape en cours est gardée dans le navigateur : l'élève passe d'un onglet à l'autre (Make, son tableur, cette page).

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { makeScenarioSvg } from '@/lib/learning/makeScenario';
import { makeTutorial, type Field, type Icon, type Screen, type Seg, type TutoLang } from '@/lib/learning/makeTutorial';
import css from './MakeTutorial.module.css';

const KEY = 'make-tuto-step';

/** Les valeurs entre [[…]] deviennent des pastilles. */
function rich(text: string): ReactNode[] {
  return text.split(/\[\[(.+?)\]\]/g).map((part, i) => (i % 2 ? <span key={i} className={css.chip}>{part}</span> : part));
}

function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).catch(() => fallback(text));
  return Promise.resolve(fallback(text));
}
function fallback(text: string) {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  try { document.execCommand('copy'); } catch { /* rien à faire de plus */ }
  area.remove();
}

const Badge = ({ n }: { n?: number }) => (n ? <span className={css.badge} aria-hidden="true">{n}</span> : null);

// ---------- Icônes (traits simples, couleur du texte) ----------

function StepIcon({ kind }: { kind: Icon }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const paths: Record<Icon, ReactNode> = {
    sheet: <><rect x="5" y="3.5" width="14" height="17" rx="2" {...p} /><path d="M5 8.5h14M5 13h14M5 17.5h14M11 8.5v12" {...p} /></>,
    plus: <path d="M12 5v14M5 12h14" {...p} strokeWidth={2.4} />,
    trigger: <><circle cx="12" cy="12" r="8" {...p} /><path d="M12 7.5V12h3.5" {...p} /></>,
    ai: <path d="M11 3.5q1 6.5 7.5 7.5q-6.5 1-7.5 7.5q-1-6.5-7.5-7.5q6.5-1 7.5-7.5ZM18.5 3v3M17 4.5h3" {...p} />,
    run: <path d="M8 5.5v13l10.5-6.5Z" {...p} />,
    out: <><rect x="4" y="4" width="11" height="15" rx="2" {...p} /><path d="M12 12h8m-3-3 3 3-3 3" {...p} /></>,
    filter: <path d="M4.5 5.5h15l-5.8 7v5.5l-3.4-1.8v-3.7Z" {...p} />,
    done: <path d="m5 12.5 4.5 4.5L19 7.5" {...p} strokeWidth={2.4} />,
  };
  return <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">{paths[kind]}</svg>;
}

const AppDot = ({ app }: { app: 'sheets' | 'ai' | 'filter' }) => (
  <span className={css.appDot} data-app={app} aria-hidden="true">
    <StepIcon kind={app === 'sheets' ? 'sheet' : app === 'ai' ? 'ai' : 'filter'} />
  </span>
);

const Chevron = () => <svg className={css.chev} viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="m3 4.5 3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;

function Segs({ value }: { value: Seg[] }) {
  return <>{value.map((s, i) => (typeof s === 'string' ? <span key={i}>{s}</span> : <span key={i} className={css.pill} data-mod={s.mod}>{s.label}</span>))}</>;
}

// ---------- Les écrans reproduits ----------

function FieldView({ f, first, t, copied, onCopy }: { f: Field; first: boolean; t: ReturnType<typeof makeTutorial>; copied: string | null; onCopy: (id: string, text: string) => void }) {
  const box = (() => {
    switch (f.kind) {
      case 'select':
        return <div className={css.box}>{f.hint && <small className={css.group}>{f.hint} ›</small>}<span className={css.val}>{f.value}</span><Chevron /></div>;
      case 'input':
        return <div className={css.box}><span className={css.val}>{f.value}</span></div>;
      case 'map':
        return <div className={`${css.box} ${css.map}`}><Segs value={f.value} /></div>;
      case 'yesno':
        return <div className={css.yesno}><span className={f.yes ? css.on : ''}>Yes</span><span className={f.yes ? '' : css.on}>No</span></div>;
      case 'connection':
        return f.hl
          ? <div className={css.connRow}><span className={css.makeBtn}>Create a connection</span><small className={css.after}>→ {f.value}</small></div>
          : <div className={css.box}><span className={css.val}>{f.value}</span><Chevron /></div>;
      case 'items':
        return (
          <div className={css.items}>
            {f.items.map((it, k) => {
              const id = `desc-${it.name}`;
              return (
                <div key={it.name} className={css.item}>
                  <span className={css.itemNo}>Item {k + 1}</span>
                  <div className={css.itemRow}>
                    <div><small>Name</small><div className={css.box}><span className={css.val}>{it.name}</span></div></div>
                    <div><small>Type</small><div className={css.box}><span className={css.val}>{it.type}</span><Chevron /></div></div>
                  </div>
                  <small>Description</small>
                  <div className={`${css.box} ${css.desc}`}>
                    <span className={css.val}>{it.desc}</span>
                    <button type="button" className={css.copyMini} onClick={() => onCopy(id, it.desc)}>{copied === id ? t.copied : t.copyDesc}</button>
                  </div>
                </div>
              );
            })}
            <span className={css.addItem}>+ {f.add}</span>
          </div>
        );
      case 'values':
        return (
          <div className={css.values}>
            {f.rows.map((r) => (
              <div key={r.col} className={css.valueRow}><small>{r.col}</small><div className={`${css.box} ${css.map}`}><Segs value={r.value} /></div></div>
            ))}
          </div>
        );
    }
  })();
  return (
    <div className={css.field} data-hl={f.hl ? '' : undefined}>
      {f.hl && first && <Badge n={f.hl} />}
      {f.label && <span className={css.label}>{f.label}</span>}
      {box}
    </div>
  );
}

function ScreenView({ s, t, lang, copied, onCopy }: { s: Screen; t: ReturnType<typeof makeTutorial>; lang: TutoLang; copied: string | null; onCopy: (id: string, text: string) => void }) {
  switch (s.kind) {
    case 'canvas':
      return (
        <div className={`${css.shot} ${css.canvas}`}>
          <div className={css.wide} dangerouslySetInnerHTML={{ __html: makeScenarioSvg(lang, false, true, s.opts) }} />
          <div className={css.compact} dangerouslySetInnerHTML={{ __html: makeScenarioSvg(lang, true, true, s.opts) }} />
        </div>
      );
    case 'sheet': {
      const mark = (at: string) => s.marks?.find((m) => m.at === at)?.n;
      const widths = s.tab === 1 ? [150, 170, 84, 330] : [150, 160, 100, 70, 96];
      const letters = 'ABCDEFG'.slice(0, s.head.length).split('');
      return (
        <div className={`${css.shot} ${css.sheet}`}>
          <div className={css.sheetTop}>
            <span className={css.sheetIcon} aria-hidden="true"><StepIcon kind="sheet" /></span>
            <span className={css.sheetName} data-hl={mark('title') ? '' : undefined}>{t.sheetName}<Badge n={mark('title')} /></span>
          </div>
          <div className={css.gridWrap}>
            <table className={css.grid} style={{ width: 34 + widths.reduce((x, y) => x + y, 0) }}>
              <colgroup><col style={{ width: 34 }} />{widths.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
              <thead><tr><th />{letters.map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>
                <tr>
                  <th>1</th>
                  {s.head.map((h, i) => (
                    <td key={h} className={css.hd} data-hl={i === 0 && mark('a1') ? '' : undefined}>{h}{i === 0 && <Badge n={mark('a1')} />}</td>
                  ))}
                </tr>
                {s.rows.map((r, k) => (
                  <tr key={k}><th>{k + 2}</th>{r.map((c, i) => <td key={i} className={c ? '' : css.empty}>{c}</td>)}</tr>
                ))}
                {Array.from({ length: Math.max(0, (s.tab === 1 ? 8 : 4) - s.rows.length - 1) }).map((_, k) => (
                  <tr key={`e${k}`}><th>{s.rows.length + 2 + k}</th>{letters.map((c) => <td key={c} />)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={css.tabs}>
            <span className={css.tabPlus} aria-hidden="true">+</span>
            {t.tabs.map((name, i) => {
              const n = mark(i === 0 ? 'tab1' : 'tab2');
              return <span key={name} className={css.tab} data-on={s.tab === i + 1 ? '' : undefined} data-hl={n ? '' : undefined}>{name}<Badge n={n} /></span>;
            })}
          </div>
          {s.tab === 1 && <p className={css.caption}>{t.kitTags}</p>}
        </div>
      );
    }
    case 'dashboard':
      return (
        <div className={`${css.shot} ${css.dash}`}>
          <div className={css.dashSide} aria-hidden="true">
            <span className={css.dashLogo} />
            {['Organization', 'Scenarios', 'Templates', 'Connections', 'Webhooks'].map((x) => <span key={x} data-on={x === 'Scenarios' ? '' : undefined}><i />{x}</span>)}
          </div>
          <div className={css.dashMain}>
            <div className={css.dashHead}>
              <strong>Scenarios</strong>
              <span className={css.makeBtnFill} data-hl="">+ Create a new scenario<Badge n={s.n} /></span>
            </div>
            <div className={css.skeleton} aria-hidden="true"><i /><i /><i /></div>
          </div>
        </div>
      );
    case 'picker':
      return (
        <div className={`${css.shot} ${css.picker}`}>
          <div className={css.search}><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" strokeWidth="2" /><path d="m15 15 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>{s.query}</div>
          <div className={css.pickApp}><AppDot app={s.app} /><strong>{s.query}</strong></div>
          <ul>
            {s.items.map((x, i) => (
              <li key={x} data-hl={i === s.pick ? '' : undefined}><AppDot app={s.app} />{x}{i === s.pick && <Badge n={s.n} />}</li>
            ))}
          </ul>
        </div>
      );
    case 'panel': {
      const seen = new Set<number>();
      return (
        <div className={`${css.shot} ${css.panel}`}>
          <div className={css.panelHead} data-app={s.app}>
            <AppDot app={s.app} />
            <div><strong>{s.title}</strong>{s.action && <small>{s.action}</small>}</div>
            <span className={css.x} aria-hidden="true">×</span>
          </div>
          <div className={css.panelBody}>
            {s.fields.map((f, i) => {
              const first = Boolean(f.hl) && !seen.has(f.hl!);
              if (f.hl) seen.add(f.hl);
              return <FieldView key={i} f={f} first={first} t={t} copied={copied} onCopy={onCopy} />;
            })}
          </div>
          <div className={css.panelFoot}><span className={css.ghostBtn}>Cancel</span><span className={css.okBtn}>{s.ok}</span></div>
        </div>
      );
    }
    case 'start':
      return (
        <div className={`${css.shot} ${css.dialog}`}>
          <strong>{s.title}</strong>
          {s.options.map((o, i) => (
            <span key={o} className={css.radio} data-on={i === s.pick ? '' : undefined} data-hl={i === s.pick ? '' : undefined}><i />{o}{i === s.pick && <Badge n={s.n} />}</span>
          ))}
          <div className={css.panelFoot}><span className={css.okBtn}>OK</span></div>
        </div>
      );
    case 'output':
      return (
        <div className={`${css.shot} ${css.inspector}`}>
          <div className={css.insHead}><AppDot app="ai" /><strong>{s.title}</strong></div>
          <div className={css.op} data-open="">
            <span className={css.opHead}><Chevron />Operation 1</span>
            <span className={css.opSec}>OUTPUT</span>
            <div className={css.bundle}>
              <span>Bundle 1</span>
              <dl>{s.open.map((kv) => <div key={kv.k}><dt>{kv.k}</dt><dd data-key={kv.k}>{kv.v}</dd></div>)}</dl>
            </div>
          </div>
          {Array.from({ length: s.operations - 1 }).map((_, k) => <div key={k} className={css.op}><span className={css.opHead}><Chevron />Operation {k + 2}</span></div>)}
        </div>
      );
  }
}

// ---------- Le tuto ----------

export default function MakeTutorial({ lang, kai }: { lang: TutoLang; kai: boolean }) {
  const t = makeTutorial(lang);
  const total = t.steps.length;
  const [step, setStep] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);
  const top = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(KEY));
      if (Number.isInteger(saved) && saved > 0 && saved < total) setStep(saved);
    } catch { /* navigation privée : on repart de l'étape 1 */ }
  }, [total]);

  const go = (i: number) => {
    setStep(i);
    try { localStorage.setItem(KEY, String(i)); } catch { /* rien */ }
    const el = top.current;
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const onCopy = (id: string, text: string) => {
    copyText(text).then(() => {
      setCopied(id);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(null), 2200);
    });
  };

  const s = t.steps[step];
  const screensKind = s.screens.map((x) => x.kind).join(' ');

  return (
    <div className={css.tuto} ref={top}>
      <h3>{t.title}</h3>
      <p className={css.lead}>{t.lead}</p>

      {/* La frise : les huit étapes reliées par des pointillés, comme les modules d'un scénario. */}
      <ol className={css.strip}>
        {t.steps.map((x, i) => (
          <li key={x.short} data-state={i < step ? 'done' : i === step ? 'now' : 'next'}>
            <button type="button" onClick={() => go(i)} aria-current={i === step ? 'step' : undefined} aria-label={`${t.stepOf(i + 1, total)} : ${x.title}`}>
              <span className={css.dot}><StepIcon kind={i < step ? 'done' : x.icon} /></span>
              <span className={css.short}>{x.short}</span>
            </button>
          </li>
        ))}
      </ol>

      <article className={css.step} aria-live="polite">
        <header className={css.stepHead}>
          <span className={css.stepNo}>{step + 1}</span>
          <div><small>{t.stepOf(step + 1, total)}</small><h4>{s.title}</h4></div>
        </header>

        <div className={css.screens} data-kinds={screensKind}>
          {s.screens.map((x, i) => <ScreenView key={`${step}-${i}`} s={x} t={t} lang={lang} copied={copied} onCopy={onCopy} />)}
        </div>

        <ol className={css.todo}>
          {s.todo.map((line, i) => <li key={i}><span className={css.num}>{i + 1}</span><span>{rich(line)}</span></li>)}
        </ol>

        {s.copy && (
          <div className={css.copies}>
            {s.copy.map((c, i) => {
              const id = `copy-${step}-${i}`;
              return (
                <button key={id} type="button" className={`btn btn-sm ${i === 0 ? 'btn-green' : 'btn-ghost'}`} onClick={() => onCopy(id, c.text)}>
                  {copied === id ? t.copied : c.label}
                </button>
              );
            })}
          </div>
        )}

        <p className={css.see}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#3D5A99" /><path d="m7.5 12.3 3 3 6-6.3" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span><strong>{t.seeLabel}</strong> {rich(s.see)}</span>
        </p>

        <details className={css.stuck}>
          <summary>{t.stuckLabel}</summary>
          <ul>{s.stuck.map((line, i) => <li key={i}>{rich(line)}</li>)}</ul>
          {kai && <button type="button" className="btn btn-sm btn-ghost" data-kai-open data-kai-prompt={t.kaiPrompt(step + 1, s.title)}>{t.kaiAsk}</button>}
        </details>

        <nav className={css.nav}>
          {step > 0 ? <button type="button" className="btn btn-sm btn-ghost" onClick={() => go(step - 1)}>{t.prev}</button> : <span />}
          {step < total - 1
            ? <button type="button" className="btn btn-sm btn-green" onClick={() => go(step + 1)}>{t.next}</button>
            : <a className="btn btn-sm btn-green" href="#content" onClick={() => setTimeout(() => document.getElementById('content')?.focus(), 400)}>{t.finish}</a>}
        </nav>
      </article>
      <small className={css.note}>{t.note}</small>
    </div>
  );
}
