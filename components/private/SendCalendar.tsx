import Link from 'next/link';
import { calendarDay, calendarMonth, feedFreshness, type CalendarDay } from '@/lib/sendCalendar';

// /admin › Calendrier (28/11) : les e-mails envoyés chaque jour, heure de Paris. Un mois en grille (Smart Mail + site,
// les ventes du jour en dessous), et le détail du jour choisi : Smart Mail compte par compte, heure par heure, et les
// mails du site un par un. Dessiné sur le serveur, sans script.
type Params = Record<string, string | string[] | undefined>;

const KIND: Record<string, string> = {
  login: 'Connexion', confirmation: 'Confirmation d’achat', finish_nudge: 'Relance formation', pay_reminder_1: 'Rappel de paiement',
  pay_reminder_2: 'Rappel veille de clôture', ticket_received: 'Ticket reçu', ticket_reply: 'Réponse à un ticket',
  ambassador_welcome: 'Bienvenue ambassadeur', call_booked: 'Appel réservé', outreach_alert: 'Alerte prospection',
  relance_alert: 'Alerte rappels', test: 'Test',
};
const kindLabel = (k: string) => KIND[k] ?? (k.startsWith('pay_reminder') ? 'Rappel de paiement' : k.startsWith('ticket') ? 'Ticket' : k);
const SERVER: Record<string, string> = { 'smartmail-ovh': 'OVH', 'smartmail-paris': 'Paris' };
const server = (s: string) => SERVER[s] ?? s.replace(/^smartmail-/, '');

const n = (v: number) => new Intl.NumberFormat('fr-FR').format(v);
const compact = (v: number) => (v < 10_000 ? n(v) : new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(v));
const plural = (v: number, one: string, many = `${one}s`) => `${n(v)} ${v > 1 ? many : one}`;
const parisDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
const at = (d: Date) => d.toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const hm = (d: Date | string) => new Date(d).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
const longDay = (day: string, opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'UTC', ...opts });
const monthLabel = (month: string) => new Date(`${month}-15T12:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'UTC', month: 'long', year: 'numeric' });
const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 15)).toISOString().slice(0, 7);
};
const href = (month: string, day?: string) => `/admin?tab=calendrier&mois=${month}${day ? `&jour=${day}#jour` : ''}`;
const total = (d: CalendarDay) => d.smartmail + d.site;
const WEEK = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];

// Intensité de la case : 5 niveaux sur une échelle logarithmique (un jour à 9 000 mails écraserait sinon tous les autres).
const level = (v: number, max: number) => (v <= 0 ? 0 : Math.min(5, 1 + Math.floor((4 * Math.log(v)) / Math.log(Math.max(2, max)))));

/** 24 barres, une par heure de Paris. */
function Hours({ hours, w = 120, h = 26, axis = false }: { hours: number[]; w?: number; h?: number; axis?: boolean }) {
  const max = Math.max(1, ...hours);
  const top = axis ? 14 : 0, bottom = axis ? 16 : 0, inner = h - top - bottom;
  const bw = w / 24;
  return (
    <svg className="sc-hours" viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img"
      aria-label={hours.map((v, i) => (v ? `${i} h : ${v}` : '')).filter(Boolean).join(', ') || 'aucun envoi'}>
      {axis && <line x1={0} x2={w} y1={top + inner} y2={top + inner} stroke="var(--line)" />}
      {hours.map((v, i) => {
        const bh = v ? Math.max(2, (v / max) * inner) : 0;
        return (
          <g key={i}>
            {v > 0 && <rect x={i * bw + bw * 0.14} y={top + inner - bh} width={bw * 0.72} height={bh} rx={Math.min(2, bw * 0.2)} fill="var(--navy)"><title>{`${i} h – ${i + 1} h : ${n(v)}`}</title></rect>}
            {axis && v > 0 && v === max && <text x={i * bw + bw / 2} y={top + inner - bh - 3} textAnchor="middle" className="sc-axis">{n(v)}</text>}
            {axis && i % 3 === 0 && <text x={i * bw + bw / 2} y={h - 3} textAnchor="middle" className="sc-axis">{i} h</text>}
          </g>
        );
      })}
    </svg>
  );
}

export default async function SendCalendar({ params }: { params: Params }) {
  const today = parisDay();
  const askedMonth = String(params.mois ?? '');
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(askedMonth) ? askedMonth : today.slice(0, 7);
  const askedDay = String(params.jour ?? '');
  const day = /^\d{4}-\d{2}-\d{2}$/.test(askedDay) && askedDay.startsWith(month) && !Number.isNaN(Date.parse(askedDay)) && askedDay <= today
    ? askedDay : today.startsWith(month) ? today : '';

  const [days, fresh] = await Promise.all([calendarMonth(month), feedFreshness()]);
  const max = Math.max(0, ...days.map(total));
  const sum = (f: (d: CalendarDay) => number) => days.reduce((s, d) => s + f(d), 0);
  const best = days.reduce<CalendarDay | null>((a, d) => (total(d) > (a ? total(a) : 0) ? d : a), null);
  const [y, m] = month.split('-').map(Number);
  const offset = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // lundi en premier
  const stale = fresh.filter((f) => Date.now() - f.at.getTime() > 30 * 60_000);

  return (
    <>
      <section className="cx-card sc">
        <div className="cx-toolbar">
          <h2>E-mails envoyés <small>· {monthLabel(month)}</small></h2>
          <nav className="sc-nav" aria-label="Mois">
            <Link className="btn btn-sm btn-ghost" href={href(shiftMonth(month, -1))} aria-label="Mois précédent">‹ {monthLabel(shiftMonth(month, -1)).split(' ')[0]}</Link>
            {!today.startsWith(month) && <Link className="btn btn-sm btn-ghost" href={href(today.slice(0, 7), today)}>Aujourd’hui</Link>}
            {shiftMonth(month, 1) <= today.slice(0, 7) && (
              <Link className="btn btn-sm btn-ghost" href={href(shiftMonth(month, 1))} aria-label="Mois suivant">{monthLabel(shiftMonth(month, 1)).split(' ')[0]} ›</Link>
            )}
          </nav>
        </div>

        <div className="sc-sum">
          <div><span>Total du mois</span><strong>{n(sum(total))}</strong><small>e-mails envoyés</small></div>
          <div><span>Smart Mail</span><strong>{n(sum((d) => d.smartmail))}</strong><small>reçus par les élèves</small></div>
          <div><span>Site</span><strong>{n(sum((d) => d.site))}</strong><small>{sum((d) => d.siteFailed) ? `${plural(sum((d) => d.siteFailed), 'refusé')}` : 'connexions, rappels, tickets…'}</small></div>
          <div><span>Meilleur jour</span><strong>{best ? n(total(best)) : '—'}</strong><small>{best ? longDay(best.day, { weekday: 'long', day: 'numeric', month: 'long' }) : 'aucun envoi ce mois-ci'}</small></div>
        </div>

        <div className="sc-grid">
          {WEEK.map((w) => <div key={w} className="sc-dow" aria-hidden="true">{w}</div>)}
          {Array.from({ length: offset }, (_, i) => <div key={`v${i}`} className="sc-blank" aria-hidden="true" />)}
          {days.map((d) => {
            const t = total(d);
            const future = d.day > today;
            const label = `${longDay(d.day)} : ${plural(t, 'e-mail')} (${n(d.smartmail)} Smart Mail, ${n(d.site)} site), ${plural(d.sales, 'vente')}`;
            const body = (
              <>
                <span className="sc-date">{Number(d.day.slice(8))}</span>
                {!future && !t && !d.sales && <small className="sc-none">aucun envoi</small>}
                {!future && (t > 0 || d.sales > 0) && (
                  <>
                    <strong className="sc-total"><span className="sc-full">{n(t)}</span><span className="sc-short">{compact(t)}</span></strong>
                    <small className="sc-line">Smart Mail <b>{n(d.smartmail)}</b></small>
                    <small className="sc-line">Site <b>{n(d.site)}</b>{d.siteFailed ? <em className="cx-flag"> · {d.siteFailed} ⚑</em> : null}</small>
                    <small className={`sc-sales${d.sales ? ' on' : ''}`}>{d.sales ? plural(d.sales, 'vente') : '0 vente'}</small>
                  </>
                )}
              </>
            );
            const cls = `sc-day lv-${future ? 0 : level(t, max)}${d.day === today ? ' today' : ''}${d.day === day ? ' sel' : ''}${future ? ' future' : ''}`;
            return future
              ? <div key={d.day} className={cls} aria-hidden="true">{body}</div>
              : <Link key={d.day} className={cls} href={href(month, d.day)} aria-label={label} aria-current={d.day === day ? 'date' : undefined}>{body}</Link>;
          })}
        </div>

        <div className="sc-foot">
          <span className="sc-legend" aria-hidden="true">Moins {[1, 2, 3, 4, 5].map((l) => <i key={l} className={`lv-${l}`} />)} Plus</span>
          <p className="help">
            {fresh.length
              ? <>Chiffres Smart Mail reçus : {fresh.map((f) => `${server(f.source)} ${at(f.at)}`).join(' · ')}{stale.length ? <strong className="cx-flag"> · ⚑ {stale.map((f) => server(f.source)).join(' et ')} ne répond plus depuis plus de 30 min</strong> : null}</>
              : <strong className="cx-flag">⚑ Aucun chiffre Smart Mail reçu pour l’instant (envoi toutes les 10 minutes par chaque serveur).</strong>}
            .{' '}Jours en heure de Paris. Smart Mail : mails arrivés chez les élèves, depuis les boîtes des ambassadeurs. Site : mails envoyés par le site lui-même.
          </p>
        </div>
      </section>

      {day && <DayDetail day={day} />}
    </>
  );
}

async function DayDetail({ day }: { day: string }) {
  const d = await calendarDay(day);
  const smTotal = d.accounts.reduce((s, a) => s + a.total, 0);
  const hours = Array.from({ length: 24 }, (_, i) => d.accounts.reduce((s, a) => s + a.hours[i], 0));
  const count = (f: (k: { status: string }) => boolean) => d.kinds.filter(f).reduce((s, k) => s + k.n, 0);
  const siteAll = count(() => true), siteSent = count((k) => k.status === 'sent'), failed = count((k) => k.status === 'failed');
  const kinds = new Map<string, { sent: number; other: number }>();
  for (const k of d.kinds) {
    const label = kindLabel(k.kind);
    const v = kinds.get(label) ?? { sent: 0, other: 0 };
    if (k.status === 'sent') v.sent += k.n; else v.other += k.n;
    kinds.set(label, v);
  }
  const first = hours.findIndex((v) => v > 0), last = 23 - [...hours].reverse().findIndex((v) => v > 0);

  return (
    <section className="cx-card sc-detail" id="jour">
      <h2>{longDay(day)} <small>· {plural(smTotal + siteSent, 'e-mail')}</small></h2>
      <div className="sc-sum">
        <div><span>Smart Mail</span><strong>{n(smTotal)}</strong><small>{d.accounts.length ? `${plural(d.accounts.length, 'compte')}${first >= 0 ? `, de ${first} h à ${last + 1} h` : ''}` : 'aucun envoi'}</small></div>
        <div><span>Site</span><strong>{n(siteSent)}</strong><small>{siteAll ? (failed ? plural(failed, 'refusé') : 'tous partis') : 'aucun mail'}{siteAll - siteSent - failed > 0 ? ` · ${n(siteAll - siteSent - failed)} non envoyés` : ''}</small></div>
        <div><span>Ventes du jour</span><strong>{n(d.sales)}</strong><small>payées, hors invités et tests</small></div>
      </div>

      <h3 className="sc-h3">Smart Mail · heure par heure</h3>
      {smTotal ? (
        <>
          <div className="sc-dayhours"><Hours hours={hours} w={720} h={110} axis /></div>
          <div className="cx-scroll">
            <table className="cx-table">
              <thead><tr><th>École</th><th>Compte</th><th>Serveur</th><th>Heures</th><th className="num">Mails</th></tr></thead>
              <tbody>
                {d.accounts.map((a) => (
                  <tr key={`${a.source}:${a.account}`}>
                    <td>{a.school || a.domain || '—'}{a.school && a.domain ? <small>{a.domain}</small> : null}</td>
                    <td>{a.firstName || `Compte n° ${a.account}`}<small>{a.firstName ? `n° ${a.account}` : ''}{a.firstName && !a.active ? ' · ' : ''}{a.active ? '' : 'compte fermé'}</small></td>
                    <td>{server(a.source)}</td>
                    <td><Hours hours={a.hours} /></td>
                    <td className="num"><strong>{n(a.total)}</strong></td>
                  </tr>
                ))}
                {d.accounts.length > 1 && <tr><td colSpan={4}><strong>Total</strong></td><td className="num"><strong>{n(smTotal)}</strong></td></tr>}
              </tbody>
            </table>
          </div>
        </>
      ) : <p className="help">Aucun mail Smart Mail ce jour-là{d.feeds.length ? '' : ' (les chiffres Smart Mail ne sont pas encore arrivés)'}.</p>}

      <h3 className="sc-h3">Site · par type</h3>
      {siteAll ? (
        <>
          <div className="cx-scroll">
            <table className="cx-table">
              <thead><tr><th>Type</th><th className="num">Envoyés</th><th className="num">Refusés ou non envoyés</th></tr></thead>
              <tbody>
                {[...kinds.entries()].sort((a, b) => b[1].sent + b[1].other - (a[1].sent + a[1].other)).map(([k, v]) => (
                  <tr key={k}><td>{k}</td><td className="num">{n(v.sent)}</td><td className="num">{v.other ? <span className="cx-flag">{n(v.other)}</span> : '—'}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <details className="sc-list">
            <summary>Voir les {plural(siteAll, 'e-mail')} du site, un par un{siteAll > d.mails.length ? ` (les ${n(d.mails.length)} derniers)` : ''}</summary>
            <div className="cx-scroll">
              <table className="cx-table">
                <thead><tr><th>Heure</th><th>Destinataire</th><th>Sujet</th><th>Type</th><th>Statut</th></tr></thead>
                <tbody>
                  {d.mails.map((m) => (
                    <tr key={String(m.id)}>
                      <td>{hm(m.created_at)}</td>
                      <td>{String(m.to_email)}</td>
                      <td><Link href={`/admin?tab=emails&id=${m.id}#mail-${m.id}`}>{String(m.subject)}</Link></td>
                      <td>{kindLabel(String(m.kind))}</td>
                      <td><span className={`cx-badge tone-${m.status === 'sent' ? 'ok' : m.status === 'failed' ? 'bad' : 'muted'}`}>{m.status === 'sent' ? 'Envoyé' : m.status === 'failed' ? 'Refusé' : 'Non envoyé'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      ) : <p className="help">Aucun mail du site ce jour-là.</p>}
    </section>
  );
}
