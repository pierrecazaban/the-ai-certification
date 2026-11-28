import Link from 'next/link';
import { GRADES, MIN_SAMPLE, PERIODS, conversionBySchool, isPeriod, type Grade, type SchoolConversion } from '@/lib/conversion';
import { feedFreshness } from '@/lib/sendCalendar';

// /admin › Conversion (28/11) : pour chaque école, les e-mails Smart Mail reçus par ses élèves face à ses ventes, avec une
// note de A à E (lib/conversion.ts). Une période au choix, une petite courbe jour par jour (heure par heure pour un jour).
// Dessiné sur le serveur, sans script.
type Params = Record<string, string | string[] | undefined>;
type Sort = 'mails' | 'ventes' | 'taux';

const n = (v: number) => new Intl.NumberFormat('fr-FR').format(Math.round(v));
const plural = (v: number, one: string, many = `${one}s`) => `${n(v)} ${v > 1 ? many : one}`;
/** 0,24 % ; 1,8 % ; 12 % */
export const pct = (v: number | null) => (v === null ? '—'
  : `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: v < 1 ? 2 : v < 10 ? 1 : 0, minimumFractionDigits: v > 0 && v < 1 ? 2 : 0 }).format(v)} %`);
const shortDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'short' });
const longDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
const at = (d: Date) => d.toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const SERVER: Record<string, string> = { 'smartmail-ovh': 'OVH', 'smartmail-paris': 'Paris' };
const href = (periode: string, tri: Sort) => `/admin?tab=conversion&periode=${periode}${tri === 'mails' ? '' : `&tri=${tri}`}`;

const BEST_SAMPLE = 1000;
const GRADE_TEXT: Record<Grade, string> = { A: 'Excellent', B: 'Bon', C: 'Moyen', D: 'Faible', E: 'Très faible' };
/** « 1 vente pour 200 e-mails ou moins » pour la légende et les bulles. */
const gradeRule = (g: Grade) => {
  const i = GRADES.findIndex((x) => x.grade === g);
  if (g === 'A') return `1 vente pour ${n(GRADES[0].perSale)} e-mails ou moins (≥ ${pct(100 / GRADES[0].perSale)})`;
  if (g === 'E') return `plus de ${n(GRADES[i - 1].perSale)} e-mails par vente, ou aucune vente`;
  return `1 vente pour ${n(GRADES[i - 1].perSale + 1)} à ${n(GRADES[i].perSale)} e-mails`;
};

/** La note, en lettre. Pointillée quand trop peu d'e-mails sont partis pour qu'elle veuille dire grand-chose. */
export function GradeLetter({ grade, size = 'md', indicative = false, label }: { grade: Grade | null; size?: 'sm' | 'md' | 'xl'; indicative?: boolean; label?: string }) {
  if (!grade) return <span className={`cv-grade cv-none ${size}`} title="Aucun e-mail Smart Mail sur la période">–</span>;
  const title = label ?? `${grade} · ${GRADE_TEXT[grade]} : ${gradeRule(grade)}${indicative ? ` · note indicative, moins de ${n(MIN_SAMPLE)} e-mails` : ''}`;
  return <span className={`cv-grade g-${grade.toLowerCase()} ${size}${indicative ? ' faint' : ''}`} title={title} role="img" aria-label={title}>{grade}</span>;
}

/** L'échelle A → E, la note du moment en avant. */
function Scale({ grade }: { grade: Grade | null }) {
  return (
    <div className="cv-scale" aria-hidden="true">
      {GRADES.map((g) => <span key={g.grade} className={`g-${g.grade.toLowerCase()}${g.grade === grade ? ' on' : ''}`}>{g.grade}</span>)}
    </div>
  );
}

/** E-mails par jour (ou par heure) en barres, ventes en pastilles dorées au-dessus. */
function Spark({ s, buckets, hourly }: { s: SchoolConversion; buckets: string[]; hourly: boolean }) {
  const w = 168, h = 40, top = 11, inner = h - top - 1;
  const bw = w / Math.max(1, buckets.length);
  const max = Math.max(1, ...s.series.mails);
  const label = (i: number) => (hourly ? `${buckets[i]} h – ${Number(buckets[i]) + 1} h` : shortDay(buckets[i]));
  return (
    <svg className="cv-spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img"
      aria-label={buckets.map((_, i) => (s.series.mails[i] || s.series.sales[i] ? `${label(i)} : ${n(s.series.mails[i])} e-mails, ${plural(s.series.sales[i], 'vente')}` : '')).filter(Boolean).join(' ; ') || 'rien sur la période'}>
      <line x1={0} x2={w} y1={h - 0.5} y2={h - 0.5} stroke="var(--line)" />
      {buckets.map((_, i) => {
        const m = s.series.mails[i], v = s.series.sales[i];
        if (!m && !v) return null;
        const bh = m ? Math.max(2, (m / max) * inner) : 0;
        return (
          <g key={i}>
            <title>{`${label(i)} : ${n(m)} e-mail${m > 1 ? 's' : ''}, ${plural(v, 'vente')}`}</title>
            <rect x={i * bw} y={0} width={bw} height={h} fill="transparent" />
            {m > 0 && <rect x={i * bw + bw * 0.15} y={h - 1 - bh} width={Math.max(1, bw * 0.7)} height={bh} rx={Math.min(2, bw * 0.25)} className="cv-bar" />}
            {v > 0 && <circle cx={i * bw + bw / 2} cy={5} r={Math.min(4.5, 2.6 + Math.log2(v + 1) * 0.6)} className="cv-dot" />}
          </g>
        );
      })}
    </svg>
  );
}

export default async function Conversion({ params }: { params: Params }) {
  const asked = String(params.periode ?? '');
  const period = isPeriod(asked) ? asked : 'tout';
  const tri: Sort = params.tri === 'ventes' || params.tri === 'taux' ? params.tri : 'mails';
  const [c, fresh] = await Promise.all([conversionBySchool(period), feedFreshness()]);

  const contacted = c.schools.filter((s) => s.mails > 0);
  const others = c.schools.filter((s) => s.mails === 0 && s.sales > 0).sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name));
  const order: Record<Sort, (a: SchoolConversion, b: SchoolConversion) => number> = {
    mails: (a, b) => b.mails - a.mails || b.sales - a.sales,
    ventes: (a, b) => b.sales - a.sales || b.mails - a.mails,
    // Les notes indicatives (trop peu d'e-mails) passent après les autres.
    taux: (a, b) => Number(a.indicative) - Number(b.indicative) || (b.rate ?? 0) - (a.rate ?? 0) || b.mails - a.mails,
  };
  contacted.sort(order[tri]);
  // Meilleure école : au moins BEST_SAMPLE e-mails si possible (2 ventes sur 450 e-mails ne disent pas grand-chose).
  const ranked = contacted.filter((s) => !s.indicative && s.sales > 0).sort(order.taux);
  const best = ranked.find((s) => s.mails >= BEST_SAMPLE) ?? ranked[0];
  const maxRate = Math.max(0, ...contacted.map((s) => s.rate ?? 0));
  const span = c.hourly ? longDay(c.from) : c.from === c.to ? longDay(c.from) : `du ${shortDay(c.from)} au ${shortDay(c.to)}`;
  const stale = fresh.filter((f) => Date.now() - f.at.getTime() > 30 * 60_000);
  const sortLink = (id: Sort, text: string) => (
    <Link href={href(period, id)} className={`cv-sort${tri === id ? ' on' : ''}`} aria-current={tri === id ? 'true' : undefined}>{text}{tri === id ? ' ↓' : ''}</Link>
  );

  return (
    <section className="cx-card cv">
      <div className="cx-toolbar">
        <h2>Taux de conversion par école <small>· {span}</small></h2>
        <nav className="cv-periods" aria-label="Période">
          {PERIODS.map((p) => (
            <Link key={p.id} className={`btn btn-sm ${p.id === period ? 'cv-on' : 'btn-ghost'}`} href={href(p.id, tri)} aria-current={p.id === period ? 'page' : undefined}>{p.label}</Link>
          ))}
        </nav>
      </div>

      <div className="cv-top">
        <div className="cv-hero">
          <GradeLetter grade={c.grade} size="xl" indicative={c.mails > 0 && c.mails < MIN_SAMPLE} label={c.grade ? `Note globale ${c.grade} · ${GRADE_TEXT[c.grade]}` : undefined} />
          <div className="cv-hero-text">
            <span>Conversion e-mails → ventes</span>
            <strong>{pct(c.rate)}</strong>
            <small className="cv-nw">{c.perSale ? `1 vente pour ${n(c.perSale)} e-mails` : c.mails ? 'aucune vente dans les écoles contactées' : 'aucun e-mail Smart Mail sur la période'}</small>
            <Scale grade={c.grade} />
          </div>
        </div>
        <div className="sc-sum cv-sum">
          <div><span>E-mails Smart Mail</span><strong>{n(c.mails)}</strong><small>{c.mails ? `${plural(contacted.length, 'école')}, ${plural(c.accounts, 'compte')}` : 'aucun envoi'}</small></div>
          <div><span>Ventes</span><strong>{n(c.sales)}</strong><small>{c.sales ? `dont ${n(c.salesContacted)} dans les écoles contactées` : 'payées, hors invités et tests'}</small></div>
          <div className="cv-best">
            <span>Meilleure école</span>
            {best ? (
              <>
                <strong><GradeLetter grade={best.grade} size="sm" /> {best.name}</strong>
                <small>{pct(best.rate)} · {plural(best.sales, 'vente')} pour <span className="cv-nw">{n(best.mails)} e-mails</span></small>
              </>
            ) : <><strong>—</strong><small>pas encore assez d’e-mails et de ventes</small></>}
          </div>
        </div>
      </div>

      {contacted.length ? (
        <div className="cx-scroll">
          <table className="cx-table cv-table">
            <thead>
              <tr>
                <th>Note</th><th>École</th>
                <th className="num">{sortLink('mails', 'E-mails')}</th>
                <th className="num">{sortLink('ventes', 'Ventes')}</th>
                <th>{sortLink('taux', 'Taux')}</th>
                <th className="num">1 vente pour</th>
                <th>{c.hourly ? 'Heure par heure' : 'Jour par jour'}</th>
              </tr>
            </thead>
            <tbody>
              {contacted.map((s) => (
                <tr key={s.key}>
                  <td><GradeLetter grade={s.grade} indicative={s.indicative} /></td>
                  <td>
                    <strong>{s.name}</strong>{!s.known && <span className="cx-flag" title="Aucune école du site n’a ce domaine"> ⚑</span>}
                    <small>{[s.domains.join(', '), plural(s.accounts, 'compte')].filter(Boolean).join(' · ')}</small>
                  </td>
                  <td className="num">{n(s.mails)}</td>
                  <td className="num"><strong>{n(s.sales)}</strong></td>
                  <td className="cv-rate">
                    <b>{pct(s.rate)}</b>
                    <i className="cv-meter" aria-hidden="true"><i className={`g-${(s.grade ?? 'e').toLowerCase()}`} style={{ width: `${maxRate ? Math.max(s.sales ? 4 : 0, ((s.rate ?? 0) / maxRate) * 100) : 0}%` }} /></i>
                  </td>
                  <td className="num">{s.perSale ? `${n(s.perSale)} e-mails` : '—'}</td>
                  <td><Spark s={s} buckets={c.buckets} hourly={c.hourly} /></td>
                </tr>
              ))}
              <tr className="cv-total">
                <td><GradeLetter grade={c.grade} size="sm" /></td>
                <td><strong>Total des écoles contactées</strong></td>
                <td className="num"><strong>{n(c.mails)}</strong></td>
                <td className="num"><strong>{n(c.salesContacted)}</strong></td>
                <td className="cv-rate"><b>{pct(c.rate)}</b></td>
                <td className="num">{c.perSale ? `${n(c.perSale)} e-mails` : '—'}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      ) : <p className="help">Aucun e-mail Smart Mail sur la période{fresh.length ? '' : ' (les chiffres Smart Mail ne sont pas encore arrivés)'}.</p>}

      {others.length > 0 && (
        <details className="cv-others">
          <summary>Ventes sans e-mail Smart Mail sur la période · {plural(others.reduce((t, s) => t + s.sales, 0), 'vente')}, {plural(others.length, 'école')}</summary>
          <div className="cx-scroll">
            <table className="cx-table">
              <thead><tr><th>École</th><th className="num">Ventes</th></tr></thead>
              <tbody>{others.map((s) => <tr key={s.key}><td>{s.name}{s.fullName && s.fullName !== s.name ? <small>{s.fullName}</small> : null}</td><td className="num">{n(s.sales)}</td></tr>)}</tbody>
            </table>
          </div>
        </details>
      )}

      <div className="cv-legend" aria-label="Barème des notes">
        {GRADES.map((g) => (
          <span key={g.grade}><GradeLetter grade={g.grade} size="sm" label={`${g.grade} · ${GRADE_TEXT[g.grade]}`} /> <b>{GRADE_TEXT[g.grade]}</b> {gradeRule(g.grade)}</span>
        ))}
        <span><GradeLetter grade="C" size="sm" indicative label="Note indicative" /> <b>Pointillé</b> moins de {n(MIN_SAMPLE)} e-mails : note indicative</span>
      </div>

      <p className="help cv-help">
        Taux = ventes de l’école ÷ e-mails Smart Mail reçus par ses élèves sur la même période (une vente arrive souvent le lendemain de l’e-mail : préférez les périodes longues).
        École d’un compte Smart Mail : le domaine de son adresse ; ventes : l’école choisie à l’inscription, payées, ni invités ni tests.
        {' '}{fresh.length
          ? <>Chiffres Smart Mail reçus : {fresh.map((f) => `${SERVER[f.source] ?? f.source} ${at(f.at)}`).join(' · ')}{stale.length ? <strong className="cx-flag"> · ⚑ {stale.map((f) => SERVER[f.source] ?? f.source).join(' et ')} ne répond plus depuis plus de 30 min</strong> : null}.</>
          : <strong className="cx-flag">⚑ Aucun chiffre Smart Mail reçu pour l’instant.</strong>}
        {' '}<Link href="/admin?tab=calendrier">Calendrier des envois</Link>
      </p>
    </section>
  );
}
