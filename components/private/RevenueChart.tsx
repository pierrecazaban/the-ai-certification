import { sql } from '@/lib/db';
import { GUEST_PAYMENT } from '@/lib/guest';
import { estimatedFee, eurCentsSql, stripeFees } from '@/lib/revenue';
import RevenueBars from '@/components/private/RevenueBars';
import ReloadButton from '@/components/private/ReloadButton';

// Revenue per day (Paris time) over the last 30 days, as a bar chart drawn on the server (no script).
// Same rules as the other admin figures: paid only, free guests and test payments left out.
const DAYS = 30;
const NOT_TEST = `coalesce(payment_id, '') not like 'mock\\_%' and coalesce(payment_id, '') not like 'cs\\_test\\_%'`;

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100);
const money2 = (cents: number, currency: string) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);

export default async function RevenueChart() {
  // Everything in euros (19/11): sales in other currencies are converted (lib/revenue.ts).
  const rows = await sql(`
    select (coalesce(paid_at, created_at) at time zone 'Europe/Paris')::date::text as day,
      sum(${await eurCentsSql()})::int as cents, count(*)::int as n
    from registrations
    where status = 'paid' and payment_id is distinct from '${GUEST_PAYMENT}' and ${NOT_TEST}
      and coalesce(paid_at, created_at) >= (date_trunc('day', now() at time zone 'Europe/Paris') - interval '${DAYS - 1} days') at time zone 'Europe/Paris'
    group by 1`);
  const currency = 'EUR';

  const byDay = new Map<string, { cents: number; n: number }>();
  for (const r of rows) byDay.set(String(r.day), { cents: Number(r.cents), n: Number(r.n) });

  const todayParis = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
  const days = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(`${todayParis}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (DAYS - 1 - i));
    const key = d.toISOString().slice(0, 10);
    return { key, d, ...(byDay.get(key) ?? { cents: 0, n: 0 }) };
  });

  // Fees: the real ones from Stripe when it can be read, otherwise Stripe's standard European price (marked "estimate").
  const since = Math.floor(days[0].d.getTime() / 1000) - 13 * 3600;
  const real = await stripeFees(since);
  const fee = (x: { key: string; cents: number; n: number }) => (real ? real.get(x.key)?.fee ?? 0 : estimatedFee(x.cents, x.n));
  const sum = (list: typeof days, f: (x: (typeof days)[number]) => number) => list.reduce((s, x) => s + f(x), 0);

  const total = sum(days, (x) => x.cents);
  const totalFees = sum(days, fee);
  const sales = sum(days, (x) => x.n);
  const net = (x: (typeof days)[number]) => x.cents - fee(x);
  const best = days.reduce((a, b) => (net(b) > net(a) ? b : a), days[0]);
  const today = days[DAYS - 1];
  const first = days.findIndex((x) => x.cents > 0);
  const shown = days.slice(Math.min(first < 0 ? DAYS - 7 : first, DAYS - 7));
  const dayLabel = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleDateString('fr-FR', { timeZone: 'UTC', ...opts });

  return (
    <>
    <section className="cx-card cx-revenue" id="revenue">
      <div className="cx-revenue-top">
        <h2>Chiffre d’affaires</h2>
        <ReloadButton />
      </div>
      <RevenueBars currency={currency} estimated={!real}
        days={shown.map((x) => ({ key: x.key, short: dayLabel(x.d, { day: '2-digit', month: '2-digit' }),
          long: dayLabel(x.d, { weekday: 'long', day: 'numeric', month: 'long' }), cents: x.cents, fee: fee(x), n: x.n }))} />
      <p className="help">
        Montants après frais Stripe{real ? ' (frais réels, mis à jour toutes les 10 min)' : ' (frais estimés au tarif européen standard, 1,5 % + 0,25 € par vente)'}.
        {' '}Les frais font {total ? Math.round((totalFees / total) * 1000) / 10 : 0} % du chiffre d’affaires
        {net(best) > 0 ? ` · meilleur jour : ${dayLabel(best.d, { day: 'numeric', month: 'long' })} (${money(net(best), currency)})` : ''}.
      </p>
    </section>
    </>
  );
}
