import Link from 'next/link';
import { GRADES, MIN_SAMPLE, PERIODS, conversionBySchool, isPeriod, type Grade, type SchoolConversion } from '@/lib/conversion';
import { feedFreshness } from '@/lib/sendCalendar';

// /admin › Conversion (28/11) : pour chaque école, les e-mails Smart Mail reçus par ses élèves face à ses ventes, avec une
// note de A à E (lib/conversion.ts). Mêmes briques que le reste de la console (tuiles, filtres, tableau) ; sur téléphone,
// une liste à la place du tableau. Dessiné sur le serveur, sans script.
type Params = Record<string, string | string[] | undefined>;
type Sort = 'mails' | 'ventes' | 'taux';

// Espace insécable ordinaire entre les milliers (l'espace fine de fr-FR s'affiche mal dans la police du site).
export const n = (v: number) => new Intl.NumberFormat('fr-FR', { useGrouping: 'always' } as Intl.NumberFormatOptions).format(Math.round(v)).replace(/\u202f/g, '\u00a0');
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
const gradeRule = (g: Grade) => {
  const i = GRADES.findIndex((x) => x.grade === g);
  if (g === 'A') return `1 vente pour ${n(GRADES[0].perSale)} e-mails ou moins`;
  if (g === 'E') return `plus de ${n(GRADES[i - 1].perSale)} e-mails par vente, ou aucune vente`;
  return `1 vente pour ${n(GRADES[i - 1].perSale + 1)} à ${n(GRADES[i].perSale)} e-mails`;
};

/** La note, en lettre sur une pastille sobre. Contour pointillé : trop peu d'e-mails pour qu'elle soit fiable. */
export function GradeLetter({ grade, size = 'md', indicative = false }: { grade: Grade | null; size?: 'md' | 'lg'; indicative?: boolean }) {
  if (!grade) return <span className={`cv-grade cv-none ${size}`} title="Aucun e-mail Smart Mail sur la période">–</span>;
  const title = `Note ${grade} · ${GRADE_TEXT[grade]} : ${gradeRule(grade)}${indicative ? ` · indicative, moins de ${n(MIN_SAMPLE)} e-mails` : ''}`;
  return <span className={`cv-grade g-${grade.toLowerCase()} ${size}${indicative ? ' faint' : ''}`} title={title} role="img" aria-label={title}>{grade}</span>;
}

/** E-mails par jour (ou par heure) en barres grises, jours de vente marqués d'un point. */
function Spark({ s, buckets, hourly }: { s: SchoolConversion; buckets: string[]; hourly: boolean }) {
  const w = 140, h = 30, top = 8, inner = h - top - 1;
  const bw = w / Math.max(1, buckets.length);
  const max = Math.max(1, ...s.series.mails);
  const label = (i: number) => (hourly ? `${buckets[i]} h` : shortDay(buckets[i]));
  return (
    <svg className="cv-spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img"
      aria-label={buckets.map((_, i) => (s.series.mails[i] || s.series.sales[i] ? `${label(i)} : ${n(s.series.mails[i])} e-mails, ${plural(s.series.sales[i], 'vente')}` : '')).filter(Boolean).join(' ; ') || 'rien sur la période'}>
      <line x1={0} x2={w} y1={h - 0.5} y2={h - 0.5} stroke="var(--line)" />
      {buckets.map((_, i) => {
        const m = s.series.mails[i], v = s.series.sales[i];
        if (!m && !v) return null;
        const bh = m ? Math.max(1.5, (m / max) * inner) : 0;
        return (
          <g key={i}>
            <title>{`${label(i)} : ${n(m)} e-mail${m > 1 ? 's' : ''}, ${plural(v, 'vente')}`}</title>
            <rect x={i * bw} y={0} width={bw} height={h} fill="transparent" />
            {m > 0 && <rect x={i * bw + bw * 0.15} y={h - 1 - bh} width={Math.max(1, bw * 0.7)} height={bh} className="cv-bar" />}
            {v > 0 && <circle cx={i * bw + bw / 2} cy={3.5} r={2.5} className="cv-dot" />}
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
  const span = c.from === c.to ? longDay(c.from) : `du ${shortDay(c.from)} au ${shortDay(c.to)}`;
  const stale = fresh.filter((f) => Date.now() - f.at.getTime() > 30 * 60_000);
  const sortLink = (id: Sort, text: string) => (
    <Link href={href(period, id)} className={`cv-sort${tri === id ? ' on' : ''}`} aria-current={tri === id ? 'true' : undefined}>{text}{tri === id ? ' ↓' : ''}</Link>
  );

  return (
    <>
      <div className="cx-toolbar cv-head">
        <h2>Conversion par école <small>· {span}</small></h2>
        <nav className="cx-pills" aria-label="Période">
          {PERIODS.map((p) => <Link key={p.id} href={href(p.id, tri)} aria-current={p.id === period ? 'page' : undefined}>{p.label}</Link>)}
        </nav>
      </div>

      <div className="cx-kpis cv-kpis">
        <div className="cx-kpi">
          <span>Taux de conversion</span>
          <strong className="cv-kpi-rate"><GradeLetter grade={c.grade} size="lg" indicative={c.mails > 0 && c.mails < MIN_SAMPLE} />{pct(c.rate)}</strong>
          <small>{c.perSale ? `1 vente pour ${n(c.perSale)} e-mails` : c.mails ? 'aucune vente dans les écoles contactées' : 'aucun e-mail sur la période'}</small>
        </div>
        <div className="cx-kpi"><span>E-mails Smart Mail</span><strong>{n(c.mails)}</strong><small>{c.mails ? `${plural(contacted.length, 'école')} · ${plural(c.accounts, 'compte')}` : 'aucun envoi'}</small></div>
        <div className="cx-kpi"><span>Ventes</span><strong>{n(c.sales)}</strong><small>{c.sales ? `${n(c.salesContacted)} dans les écoles contactées` : 'payées, hors invités et tests'}</small></div>
        <div className="cx-kpi">
          <span>Meilleure école</span>
          <strong className="cv-kpi-best">{best ? best.name : '—'}</strong>
          <small>{best ? `${pct(best.rate)} · ${plural(best.sales, 'vente')}` : 'pas encore assez de données'}</small>
        </div>
      </div>

      <section className="cx-card cv">
        {contacted.length ? (
          <>
            {/* Ordinateur : le tableau. */}
            <table className="cx-table cv-table">
              <thead>
                <tr>
                  <th>École</th>
                  <th className="num">{sortLink('mails', 'E-mails')}</th>
                  <th className="num">{sortLink('ventes', 'Ventes')}</th>
                  <th className="num">{sortLink('taux', 'Taux')}</th>
                  <th className="num">1 vente pour</th>
                  <th>{c.hourly ? 'Par heure' : 'Par jour'}</th>
                </tr>
              </thead>
              <tbody>
                {contacted.map((s) => (
                  <tr key={s.key}>
                    <td>
                      <div className="cv-school">
                        <GradeLetter grade={s.grade} indicative={s.indicative} />
                        <div>
                          {s.name}{!s.known && <span className="cx-flag" title="Aucune école du site n’a ce domaine"> ⚑</span>}
                          <small>{[s.domains.join(', '), plural(s.accounts, 'compte')].filter(Boolean).join(' · ')}</small>
                        </div>
                      </div>
                    </td>
                    <td className="num">{n(s.mails)}</td>
                    <td className="num">{n(s.sales)}</td>
                    <td className="num"><strong>{pct(s.rate)}</strong></td>
                    <td className="num cv-muted">{s.perSale ? `${n(s.perSale)} e-mails` : '—'}</td>
                    <td><Spark s={s} buckets={c.buckets} hourly={c.hourly} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td><div className="cv-school"><GradeLetter grade={c.grade} /><div><strong>Total</strong></div></div></td>
                  <td className="num"><strong>{n(c.mails)}</strong></td>
                  <td className="num"><strong>{n(c.salesContacted)}</strong></td>
                  <td className="num"><strong>{pct(c.rate)}</strong></td>
                  <td className="num cv-muted">{c.perSale ? `${n(c.perSale)} e-mails` : '—'}</td>
                  <td />
                </tr>
              </tfoot>
            </table>

            {/* Téléphone : une ligne par école. */}
            <div className="cv-sortbar">Trier : {sortLink('mails', 'E-mails')} {sortLink('ventes', 'Ventes')} {sortLink('taux', 'Taux')}</div>
            <ul className="cv-list">
              {contacted.map((s) => (
                <li key={s.key}>
                  <GradeLetter grade={s.grade} indicative={s.indicative} />
                  <div className="cv-list-main">
                    <div className="cv-list-name">{s.name}{!s.known && <span className="cx-flag"> ⚑</span>}</div>
                    <small>{plural(s.mails, 'e-mail')} · {plural(s.sales, 'vente')}</small>
                  </div>
                  <strong>{pct(s.rate)}</strong>
                </li>
              ))}
              <li className="cv-list-total">
                <GradeLetter grade={c.grade} />
                <div className="cv-list-main"><div className="cv-list-name">Total</div><small>{plural(c.mails, 'e-mail')} · {plural(c.salesContacted, 'vente')}</small></div>
                <strong>{pct(c.rate)}</strong>
              </li>
            </ul>
          </>
        ) : <p className="help">Aucun e-mail Smart Mail sur la période{fresh.length ? '' : ' (les chiffres Smart Mail ne sont pas encore arrivés)'}.</p>}

        {others.length > 0 && (
          <details className="cv-details">
            <summary>Ventes sans e-mail Smart Mail sur la période : {plural(others.reduce((t, s) => t + s.sales, 0), 'vente')}, {plural(others.length, 'école')}</summary>
            <ul className="cv-plain">{others.map((s) => <li key={s.key}><span>{s.name}</span><span>{plural(s.sales, 'vente')}</span></li>)}</ul>
          </details>
        )}

        <details className="cv-details">
          <summary>Barème des notes</summary>
          <ul className="cv-plain">
            {GRADES.map((g) => <li key={g.grade}><span><GradeLetter grade={g.grade} /> {GRADE_TEXT[g.grade]}</span><span>{gradeRule(g.grade)}</span></li>)}
            <li><span><GradeLetter grade="C" indicative /> Contour pointillé</span><span>moins de {n(MIN_SAMPLE)} e-mails : note indicative</span></li>
          </ul>
        </details>

        <p className="help cv-help">
          Taux = ventes de l’école ÷ e-mails Smart Mail reçus par ses élèves, sur la même période. Une vente suit souvent l’e-mail d’un jour : les périodes longues sont plus justes.
          {' '}{fresh.length
            ? <>Smart Mail mis à jour : {fresh.map((f) => `${SERVER[f.source] ?? f.source} ${at(f.at)}`).join(', ')}{stale.length ? <strong className="cx-flag"> · ⚑ {stale.map((f) => SERVER[f.source] ?? f.source).join(' et ')} sans nouvelles depuis plus de 30 min</strong> : null}.</>
            : <strong className="cx-flag">⚑ Aucun chiffre Smart Mail reçu.</strong>}
          {' '}<Link href="/admin?tab=calendrier">Calendrier des envois</Link>
        </p>
      </section>
    </>
  );
}
