import Link from 'next/link';
import { calendarDay, calendarMonth, feedFreshness, plannedByDay, sendPlan, type CalendarDay, type PlannedAccount, type PlanState } from '@/lib/sendCalendar';

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
  const day = /^\d{4}-\d{2}-\d{2}$/.test(askedDay) && askedDay.startsWith(month) && !Number.isNaN(Date.parse(askedDay))
    ? askedDay : today.startsWith(month) ? today : '';

  const [days, fresh, plan] = await Promise.all([
    calendarMonth(month), feedFreshness(),
    // Envois programmés (28/11) : jamais bloquants pour le calendrier.
    sendPlan().catch((e) => { console.error('[calendrier] programmation', e); return [] as PlannedAccount[]; }),
  ]);
  const planned = plannedByDay(plan);
  const plannedOf = (d: string) => (d >= today ? planned.get(d) ?? 0 : 0);
  const plannedMonth = days.reduce((s, d) => s + plannedOf(d.day), 0);
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
            {shiftMonth(month, 1) <= shiftMonth(today.slice(0, 7), 1) && ( /* le mois prochain : ses envois programmés */
              <Link className="btn btn-sm btn-ghost" href={href(shiftMonth(month, 1))} aria-label="Mois suivant">{monthLabel(shiftMonth(month, 1)).split(' ')[0]} ›</Link>
            )}
          </nav>
        </div>

        <div className="sc-sum">
          <div><span>Total du mois</span><strong>{n(sum(total))}</strong><small>e-mails envoyés</small></div>
          <div><span>Smart Mail</span><strong>{n(sum((d) => d.smartmail))}</strong><small>reçus par les élèves</small></div>
          <div><span>Site</span><strong>{n(sum((d) => d.site))}</strong><small>{sum((d) => d.siteFailed) ? `${plural(sum((d) => d.siteFailed), 'refusé')}` : 'connexions, rappels, tickets…'}</small></div>
          <div><span>Meilleur jour</span><strong>{best ? n(total(best)) : '—'}</strong><small>{best ? longDay(best.day, { weekday: 'long', day: 'numeric', month: 'long' }) : 'aucun envoi ce mois-ci'}</small></div>
          {month >= today.slice(0, 7) && (
            <div><span>Prévus</span><strong>{plannedMonth ? `≈ ${n(plannedMonth)}` : '0'}</strong><small><a href="#prevus">d’ici le {longDay(days[days.length - 1].day, { day: 'numeric', month: 'long' })}, programmés</a></small></div>
          )}
        </div>

        <div className="sc-grid">
          {WEEK.map((w) => <div key={w} className="sc-dow" aria-hidden="true">{w}</div>)}
          {Array.from({ length: offset }, (_, i) => <div key={`v${i}`} className="sc-blank" aria-hidden="true" />)}
          {days.map((d) => {
            const t = total(d);
            const future = d.day > today;
            const p = plannedOf(d.day);
            const label = future
              ? `${longDay(d.day)} : ≈ ${plural(p, 'e-mail')} prévu${p > 1 ? 's' : ''}`
              : `${longDay(d.day)} : ${plural(t, 'e-mail')} (${n(d.smartmail)} Smart Mail, ${n(d.site)} site), ${plural(d.sales, 'vente')}${p ? `, ≈ ${n(p)} encore prévus` : ''}`;
            const body = (
              <>
                <span className="sc-date">{Number(d.day.slice(8))}</span>
                {future && p > 0 && (
                  <>
                    <strong className="sc-total"><span className="sc-full">≈ {n(p)}</span><span className="sc-short">≈{compact(p)}</span></strong>
                    <small className="sc-line">prévus</small>
                  </>
                )}
                {!future && !t && !d.sales && !p && <small className="sc-none">aucun envoi</small>}
                {!future && (t > 0 || d.sales > 0) && (
                  <>
                    <strong className="sc-total"><span className="sc-full">{n(t)}</span><span className="sc-short">{compact(t)}</span></strong>
                    <small className="sc-line">Smart Mail <b>{n(d.smartmail)}</b></small>
                    <small className="sc-line">Site <b>{n(d.site)}</b>{d.siteFailed ? <em className="cx-flag"> · {d.siteFailed} ⚑</em> : null}</small>
                    <small className={`sc-sales${d.sales ? ' on' : ''}`}>{d.sales ? plural(d.sales, 'vente') : '0 vente'}</small>
                  </>
                )}
                {!future && p > 0 && <small className="sc-plan">+ ≈ {n(p)} prévus</small>}
              </>
            );
            const cls = `sc-day lv-${future ? 0 : level(t, max)}${d.day === today ? ' today' : ''}${d.day === day ? ' sel' : ''}${future ? (p ? ' planned' : ' future') : ''}`;
            return future && !p
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
            .{' '}Jours en heure de Paris. Smart Mail : mails arrivés chez les élèves, depuis les boîtes des ambassadeurs. Site : mails envoyés par le site lui-même.{' '}<Link href="/admin?tab=conversion">Taux de conversion par école ›</Link>
          </p>
        </div>
      </section>

      <Planned plan={plan} />

      {day && <DayDetail day={day} today={today} plan={plan} />}
    </>
  );
}

async function DayDetail({ day, today, plan }: { day: string; today: string; plan: PlannedAccount[] }) {
  const coming = dayEvents(plan, day);
  if (day > today) {
    const sum = coming.reduce((s, e) => s + e.n, 0);
    return (
      <section className="cx-card sc-detail" id="jour">
        <h2>{longDay(day)} <small>· ≈ {plural(sum, 'e-mail')} prévu{sum > 1 ? 's' : ''}</small></h2>
        {coming.length ? <ComingTable events={coming} /> : <p className="help">Rien de programmé ce jour-là.</p>}
      </section>
    );
  }
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

      {coming.length > 0 && (
        <>
          <h3 className="sc-h3">Encore prévus aujourd’hui · ≈ {plural(coming.reduce((s, e) => s + e.n, 0), 'e-mail')}</h3>
          <ComingTable events={coming} />
        </>
      )}

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

// ─── Envois programmés (28/11) ───────────────────────────────────────────────────────────────────────────────────────

const STATE: Record<PlanState, { label: string; tone: string }> = {
  programme: { label: 'Programmé', tone: 'ok' }, reconnexion: { label: 'Reconnexion', tone: 'warn' }, retard: { label: 'En retard', tone: 'warn' },
  erreur: { label: 'Erreur', tone: 'bad' }, pause: { label: 'En pause', tone: 'muted' }, arrete: { label: 'Arrêté', tone: 'muted' },
};
const who = (a: PlannedAccount) => a.school || a.domain || '—';
const accountName = (a: PlannedAccount) => (a.firstName ? a.firstName[0].toUpperCase() + a.firstName.slice(1) : `Compte n° ${a.id}`);
const dayOfMs = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date(ms));
const hmFr = (ms: number) => new Date(ms).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).replace(':', ' h ');
function when(ms: number) {
  const today = parisDay(), d = dayOfMs(ms);
  const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  if (d === today) return `aujourd’hui ${hmFr(ms)}`;
  if (d === tomorrow) return `demain ${hmFr(ms)}`;
  return `${longDay(d, { weekday: 'short', day: 'numeric', month: 'short' })} ${hmFr(ms)}`;
}
const every = (min: number) => (min >= 1380 ? '1 envoi par jour' : min >= 120 ? `toutes les ${Math.round(min / 60)} h` : `toutes les ${min} min`);
const remainingText = (a: PlannedAccount) => (a.remaining > 0 ? n(a.remaining) : a.collecting !== null ? `liste en cours (${n(a.collecting)} relevés)` : '0');
const endText = (a: PlannedAccount) => (a.endsAt ? longDay(dayOfMs(a.endsAt), { day: 'numeric', month: 'short', year: 'numeric' }) : a.remaining > 0 ? 'dans plus de 2 ans' : '—');

type Coming = { at: number; n: number; a: PlannedAccount };
function dayEvents(plan: PlannedAccount[], day: string): Coming[] {
  const out: Coming[] = [];
  for (const a of plan) for (const e of a.events) if (dayOfMs(e.at) === day) out.push({ ...e, a });
  return out.sort((x, y) => x.at - y.at);
}

function ComingTable({ events }: { events: Coming[] }) {
  return (
    <>
      <table className="cx-table cv-table">
        <thead><tr><th>Heure</th><th>École</th><th>Compte</th><th>Serveur</th><th className="num">E-mails</th></tr></thead>
        <tbody>
          {events.map((e) => (
            <tr key={`${e.a.key}:${e.at}`}>
              <td>{hmFr(e.at)}</td><td>{who(e.a)}</td><td>{accountName(e.a)}</td><td>{server(e.a.source)}</td>
              <td className="num">≈ {n(e.n)}{e.a.remaining === 0 && e.a.collecting !== null ? <small>liste en cours</small> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="cv-list">
        {events.map((e) => (
          <li key={`${e.a.key}:${e.at}`}>
            <div className="cv-list-main"><div className="cv-list-name">{who(e.a)}</div><small>{hmFr(e.at)} · {accountName(e.a)} · {server(e.a.source)}</small></div>
            <strong>≈ {n(e.n)}</strong>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Ce que chaque compte Smart Mail va envoyer, et les envois arrêtés qu'il faut relancer. */
function Planned({ plan }: { plan: PlannedAccount[] }) {
  const on = plan.filter((a) => a.state === 'programme');
  const stuck = plan.filter((a) => (a.state === 'reconnexion' || a.state === 'retard' || a.state === 'erreur' || a.state === 'pause') && (a.remaining > 0 || a.collecting !== null));
  const stopped = plan.filter((a) => a.state === 'arrete' && a.remaining > 0);
  const perDay = on.reduce((s, a) => s + (Number.isFinite(a.perDay) ? a.perDay : 0), 0);
  const waiting = stuck.reduce((s, a) => s + a.remaining, 0);
  return (
    <section className="cx-card sc-detail" id="prevus">
      <h2>Envois programmés <small>· {on.length ? `${plural(on.length, 'compte')}, ≈ ${n(perDay)} e-mails par jour` : 'aucun'}</small></h2>
      {on.length > 0 ? (
        <>
          <table className="cx-table cv-table">
            <thead><tr><th>École</th><th>Compte</th><th>Prochain envoi</th><th className="num">Par envoi</th><th>Rythme</th><th className="num">Élèves restants</th><th>Fin estimée</th></tr></thead>
            <tbody>
              {on.map((a) => (
                <tr key={a.key}>
                  <td>{who(a)}{a.school && a.domain ? <small>{a.domain}</small> : null}</td>
                  <td>{accountName(a)}<small>{server(a.source)}</small></td>
                  <td className="sp-next"><strong>{a.events[0] ? when(a.events[0].at) : '—'}</strong></td>
                  <td className="num">{n(a.perSend)}</td>
                  <td>{every(a.everyMin)}<small>{a.startHour} h – {a.endHour} h{a.maxDay ? ` · ${n(a.maxDay)} max par jour` : ''}</small></td>
                  <td className="num">{remainingText(a)}</td>
                  <td>{endText(a)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="cv-list">
            {on.map((a) => (
              <li key={a.key}>
                <div className="cv-list-main">
                  <div className="cv-list-name">{who(a)}</div>
                  <small>{accountName(a)} · {n(a.perSend)} par envoi, {every(a.everyMin).replace('1 envoi par jour', '1 fois par jour')} · {remainingText(a)} restants</small>
                </div>
                <strong className="sp-next">{a.events[0] ? when(a.events[0].at) : '—'}</strong>
              </li>
            ))}
          </ul>
        </>
      ) : <p className="help">Aucun envoi programmé pour l’instant.</p>}

      {stuck.length > 0 && (
        <>
          <h3 className="sc-h3">À débloquer · {plural(stuck.length, 'compte')}, {n(waiting)} élèves en attente</h3>
          <table className="cx-table cv-table">
            <thead><tr><th>École</th><th>Compte</th><th>État</th><th>Message de Smart Mail</th><th className="num">Élèves restants</th></tr></thead>
            <tbody>
              {stuck.map((a) => (
                <tr key={a.key}>
                  <td>{who(a)}</td>
                  <td>{accountName(a)}<small>{server(a.source)}</small></td>
                  <td><span className={`cx-badge tone-${STATE[a.state].tone}`}>{STATE[a.state].label}</span></td>
                  <td className="sp-msg">{a.message || '—'}{a.updatedAt ? <small>{at(new Date(a.updatedAt))}</small> : null}</td>
                  <td className="num">{remainingText(a)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="cv-list">
            {stuck.map((a) => (
              <li key={a.key}>
                <div className="cv-list-main"><div className="cv-list-name">{who(a)} <span className={`cx-badge tone-${STATE[a.state].tone}`}>{STATE[a.state].label}</span></div><small>{accountName(a)} · {a.message}</small></div>
                <strong>{remainingText(a)}</strong>
              </li>
            ))}
          </ul>
        </>
      )}

      {stopped.length > 0 && (
        <details className="cv-details">
          <summary>Comptes arrêtés avec des élèves restants · {plural(stopped.length, 'compte')}, {n(stopped.reduce((s, a) => s + a.remaining, 0))} élèves</summary>
          <ul className="cv-plain">{stopped.map((a) => <li key={a.key}><span>{who(a)} · {accountName(a)}</span><span>{n(a.remaining)} restants · {a.message}</span></li>)}</ul>
        </details>
      )}

      <p className="help cv-help">
        Prévisions d’après la programmation de chaque compte dans Smart Mail (prochain envoi, élèves par envoi, attente entre deux envois, plafond par jour, fenêtre horaire), mises à jour toutes les 10 minutes.
        Un envoi peut partir quelques minutes plus tard, ou pas du tout si l’ambassadeur doit se reconnecter.
      </p>
    </section>
  );
}
