import { sql } from '@/lib/db';
import { GUEST_PAYMENT } from '@/lib/guest';
import { FEE_ESTIMATED, eurCentsSql, feeCentsSql, readNewStripeFees } from '@/lib/revenue';
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
  // Frais Stripe gardés vente par vente (26/11) : seules les nouvelles ventes sont lues chez Stripe (lib/revenue.ts).
  await readNewStripeFees();
  // Everything in euros (19/11): sales in other currencies are converted (lib/revenue.ts). Une vente remboursée ne compte
  // plus dans le chiffre d'affaires, mais ses frais restent, le jour de la vente : Stripe ne les rend pas.
  const rows = await sql(`
    select (coalesce(paid_at, created_at) at time zone 'Europe/Paris')::date::text as day,
      coalesce(sum(${await eurCentsSql()}) filter (where status = 'paid'), 0)::int as cents,
      count(*) filter (where status = 'paid')::int as n,
      coalesce(sum(${await feeCentsSql()}), 0)::int as fee,
      count(*) filter (where ${FEE_ESTIMATED})::int as estimated
    from registrations
    where status in ('paid', 'refunded') and payment_id is distinct from '${GUEST_PAYMENT}' and ${NOT_TEST}
      and coalesce(paid_at, created_at) >= (date_trunc('day', now() at time zone 'Europe/Paris') - interval '${DAYS - 1} days') at time zone 'Europe/Paris'
    group by 1`);
  const currency = 'EUR';

  const byDay = new Map<string, { cents: number; n: number; fee: number; estimated: number }>();
  for (const r of rows) byDay.set(String(r.day), { cents: Number(r.cents), n: Number(r.n), fee: Number(r.fee), estimated: Number(r.estimated) });

  const todayParis = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
  const days = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(`${todayParis}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (DAYS - 1 - i));
    const key = d.toISOString().slice(0, 10);
    return { key, d, ...(byDay.get(key) ?? { cents: 0, n: 0, fee: 0, estimated: 0 }) };
  });

  // Fees: the real ones read from Stripe for each sale, Stripe's standard European price for a sale not read yet.
  const fee = (x: { fee: number }) => x.fee;
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
  const estimated = sum(days, (x) => x.estimated);

  return (
    <>
    <section className="cx-card cx-revenue" id="revenue">
      <div className="cx-revenue-top">
        <h2>Chiffre d’affaires</h2>
        <ReloadButton />
      </div>
      <RevenueBars currency={currency} estimated={estimated > 0}
        days={shown.map((x) => ({ key: x.key, short: dayLabel(x.d, { day: '2-digit', month: '2-digit' }),
          long: dayLabel(x.d, { weekday: 'long', day: 'numeric', month: 'long' }), cents: x.cents, fee: fee(x), n: x.n }))} />
      <p className="help">
        Montants après frais Stripe (frais réels de chaque vente, lus une seule fois chez Stripe
        {estimated ? ` ; ${estimated} vente${estimated > 1 ? 's' : ''} pas encore lue${estimated > 1 ? 's' : ''}, estimée${estimated > 1 ? 's' : ''} au tarif européen standard, 1,5 % + 0,25 €` : ''}).
        {' '}Les frais font {total ? Math.round((totalFees / total) * 1000) / 10 : 0} % du chiffre d’affaires
        {net(best) > 0 ? ` · meilleur jour : ${dayLabel(best.d, { day: 'numeric', month: 'long' })} (${money(net(best), currency)})` : ''}.
      </p>
    </section>
    </>
  );
}
