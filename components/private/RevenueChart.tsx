import { sql } from '@/lib/db';
import { GUEST_PAYMENT } from '@/lib/guest';
import { setting } from '@/lib/settings';
import { STRIPE_APP } from '@/lib/stripe';
import RevenueBars from '@/components/private/RevenueBars';
import ReloadButton from '@/components/private/ReloadButton';

/** Real Stripe fees of this site's payments since `since` (the account is shared: other sites are left out).
 *  Per Paris day: { fee, net } in cents. null when Stripe cannot be read (no key, key without the right). */
async function stripeFees(since: number): Promise<Map<string, { fee: number; net: number }> | null> {
  const key = await setting('STRIPE_SECRET_KEY');
  if (!key) return null;
  const out = new Map<string, { fee: number; net: number }>();
  let after = '';
  try {
    for (let page = 0; page < 30; page++) {
      const url = `https://api.stripe.com/v1/charges?limit=100&created[gte]=${since}&expand[]=data.balance_transaction&expand[]=data.payment_intent${after ? `&starting_after=${after}` : ''}`;
      const res = await fetch(url, { headers: { authorization: `Bearer ${key}` }, next: { revalidate: 600 } });
      if (!res.ok) return null;
      const d = (await res.json()) as { data: StripeCharge[]; has_more: boolean };
      for (const c of d.data) {
        const app = c.metadata?.app || (typeof c.payment_intent === 'object' ? c.payment_intent?.metadata?.app : undefined);
        const bt = typeof c.balance_transaction === 'object' ? c.balance_transaction : null;
        if (app !== STRIPE_APP || c.status !== 'succeeded' || !bt) continue;
        const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date(c.created * 1000));
        const cur = out.get(day) ?? { fee: 0, net: 0 };
        out.set(day, { fee: cur.fee + bt.fee, net: cur.net + bt.net });
      }
      if (!d.has_more || !d.data.length) break;
      after = d.data[d.data.length - 1].id;
    }
    return out;
  } catch {
    return null;
  }
}
type StripeCharge = {
  id: string; created: number; status: string; metadata?: Record<string, string>;
  payment_intent?: string | { metadata?: Record<string, string> } | null;
  balance_transaction?: string | { fee: number; net: number } | null;
};
/** Stripe's standard price for European cards, used only when the real fees cannot be read. */
const estimatedFee = (cents: number, n: number) => Math.round(cents * 0.015) + 25 * n;

// Revenue per day (Paris time) over the last 30 days, as a bar chart drawn on the server (no script).
// Same rules as the other admin figures: paid only, free guests and test payments left out.
const DAYS = 30;
const NOT_TEST = `coalesce(payment_id, '') not like 'mock\\_%' and coalesce(payment_id, '') not like 'cs\\_test\\_%'`;

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100);
const money2 = (cents: number, currency: string) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);

export default async function RevenueChart() {
  const rows = await sql(`
    select (coalesce(paid_at, created_at) at time zone 'Europe/Paris')::date::text as day, currency,
      sum(amount_cents)::int as cents, count(*)::int as n
    from registrations
    where status = 'paid' and payment_id is distinct from '${GUEST_PAYMENT}' and ${NOT_TEST}
      and coalesce(paid_at, created_at) >= (date_trunc('day', now() at time zone 'Europe/Paris') - interval '${DAYS - 1} days') at time zone 'Europe/Paris'
    group by 1, 2`);

  // The chart is in the main currency (the one with the most revenue); other currencies are listed below it.
  const perCurrency = new Map<string, number>();
  for (const r of rows) perCurrency.set(String(r.currency), (perCurrency.get(String(r.currency)) ?? 0) + Number(r.cents));
  const currency = [...perCurrency.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'EUR';
  const others = [...perCurrency.entries()].filter(([c]) => c !== currency);

  const byDay = new Map<string, { cents: number; n: number }>();
  for (const r of rows) if (r.currency === currency) byDay.set(String(r.day), { cents: Number(r.cents), n: Number(r.n) });

  const todayParis = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
  const days = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(`${todayParis}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (DAYS - 1 - i));
    const key = d.toISOString().slice(0, 10);
    return { key, d, ...(byDay.get(key) ?? { cents: 0, n: 0 }) };
  });

  // Fees: the real ones from Stripe when it can be read, otherwise Stripe's standard European price (marked "estimate").
  const since = Math.floor(days[0].d.getTime() / 1000) - 13 * 3600;
  const real = currency === 'EUR' ? await stripeFees(since) : null;
  const fee = (x: { key: string; cents: number; n: number }) => (real ? real.get(x.key)?.fee ?? 0 : estimatedFee(x.cents, x.n));
  const sum = (list: typeof days, f: (x: (typeof days)[number]) => number) => list.reduce((s, x) => s + f(x), 0);

  const total = sum(days, (x) => x.cents);
  const totalFees = sum(days, fee);
  const sales = sum(days, (x) => x.n);
  const best = days.reduce((a, b) => (b.cents > a.cents ? b : a), days[0]);
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
        Montants en gras : après frais Stripe{real ? ' (frais réels, mis à jour toutes les 10 min)' : ' (frais estimés au tarif européen standard, 1,5 % + 0,25 € par vente)'}.
        {' '}Les frais font {total ? Math.round((totalFees / total) * 1000) / 10 : 0} % du chiffre d’affaires
        {best.cents > 0 ? ` · meilleur jour : ${dayLabel(best.d, { day: 'numeric', month: 'long' })} (${money(best.cents, currency)})` : ''}.
      </p>
      {others.length > 0 && (
        <p className="help">Hors graphique : {others.map(([c, v]) => money(v, c)).join(' · ')} sur la même période.</p>
      )}
    </section>
    </>
  );
}
