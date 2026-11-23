import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { setting } from './settings';

// Stripe Checkout: the buyer pays on a Stripe-hosted page, then comes back to /confirmation.
// The Stripe account can be shared with other sites: every Checkout Session made here carries
// metadata.app = STRIPE_APP, and the webhook ignores sessions without it.
//   STRIPE_SECRET_KEY      sk_live_… (or a restricted rk_live_… key), sk_test_… to try without paying
//   STRIPE_WEBHOOK_SECRET  whsec_… of the endpoint {site}/api/stripe/webhook

const API = 'https://api.stripe.com/v1';
const VERSION = '2024-06-20';
export const STRIPE_APP = 'the-ai-certification';
/** Shown on the buyer's bank statement after the account prefix ("REETMA* AI CERTIF"). */
const STATEMENT_SUFFIX = 'AI CERTIF';

export const STRIPE_KEY_RE = /^(sk|rk)_(test|live)_[A-Za-z0-9]{20,}$/;
export const STRIPE_SESSION_RE = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/;

export class StripeError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export type StripeSession = {
  id: string;
  url: string | null;
  status: 'open' | 'complete' | 'expired';
  payment_status: 'paid' | 'unpaid' | 'no_payment_required';
  livemode: boolean;
  created: number;
  metadata?: Record<string, string>;
};

/** Stripe's form encoding: { a: { b: [1] } } → a[b][0]=1. Undefined values are left out. */
function encode(value: unknown, prefix: string, out: URLSearchParams) {
  if (value === undefined || value === null) return out;
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) encode(v, prefix ? `${prefix}[${k}]` : k, out);
  } else {
    out.append(prefix, String(value));
  }
  return out;
}

async function call<T>(path: string, init: { method?: string; body?: Record<string, unknown>; key?: string } = {}): Promise<T> {
  const key = init.key ?? (await setting('STRIPE_SECRET_KEY'));
  if (!key) throw new StripeError(0, 'STRIPE_SECRET_KEY is not configured');
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/x-www-form-urlencoded',
      'stripe-version': VERSION,
    },
    body: init.body ? encode(init.body, '', new URLSearchParams()).toString() : undefined,
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new StripeError(res.status, `Stripe ${path} failed: ${res.status} ${data?.error?.message ?? ''}`);
  return data as T;
}

export async function stripeEnabled() {
  return Boolean(await setting('STRIPE_SECRET_KEY'));
}

/** "test", "live" or null: read from the saved key, no network call. */
export async function stripeMode() {
  const key = await setting('STRIPE_SECRET_KEY');
  return key ? (key.includes('_live_') ? 'live' : 'test') : null;
}

export type StripeCheck =
  | { ok: true; mode: 'test' | 'live'; name: string; charges: boolean }
  | { ok: false; detail: string };

/** Checks a key with Stripe itself (reads the account, changes nothing). */
export async function checkStripeKey(apiKey: string): Promise<StripeCheck> {
  if (!STRIPE_KEY_RE.test(apiKey)) {
    return { ok: false, detail: 'This is not a Stripe secret key. It starts with sk_live_ or sk_test_ (Stripe → Developers → API keys); the publishable pk_… key does not work here.' };
  }
  try {
    const account = await call<{ business_profile?: { name?: string }; settings?: { dashboard?: { display_name?: string } }; charges_enabled?: boolean }>('/account', { key: apiKey });
    return {
      ok: true,
      mode: apiKey.includes('_live_') ? 'live' : 'test',
      name: account.business_profile?.name || account.settings?.dashboard?.display_name || 'Stripe account',
      charges: Boolean(account.charges_enabled),
    };
  } catch (err) {
    if (err instanceof StripeError && err.status === 401) return { ok: false, detail: 'Stripe refuses this key: check it is complete and still active.' };
    return { ok: false, detail: 'Stripe does not answer. Try again in a moment.' };
  }
}

export function describeStripeCheck(check: StripeCheck) {
  if (!check.ok) return check.detail;
  const mode = check.mode === 'live' ? 'Live mode: buyers really pay.' : 'Test mode: no money is taken, use Stripe’s test cards.';
  const charges = check.charges ? '' : ' ⚠ This Stripe account cannot take payments yet: finish its activation in Stripe.';
  return `Valid key (${check.name}). ${mode}${charges}`;
}

// Stripe Checkout languages for the site's locales.
const LOCALES: Record<string, string> = { 'en-us': 'en', 'en-ca': 'en', fr: 'fr', es: 'es', it: 'it', de: 'de' };

export async function createStripeCheckout(input: {
  amountCents: number;
  currency: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
  registrationId: string;
  reference: string;
  email?: string;
  locale?: string;
}) {
  const metadata = { app: STRIPE_APP, registration_id: input.registrationId, reference: input.reference };
  const session = await call<StripeSession>('/checkout/sessions', {
    method: 'POST',
    body: {
      mode: 'payment',
      line_items: [{
        quantity: 1,
        price_data: {
          currency: input.currency.toLowerCase(),
          unit_amount: input.amountCents,
          product_data: { name: input.description },
        },
      }],
      customer_email: input.email || undefined,
      client_reference_id: input.registrationId,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      locale: (input.locale && LOCALES[input.locale]) || 'auto',
      // Stripe's minimum is 30 minutes; a payment that lands after the hold still grants the place (see syncPayment).
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
      metadata,
      payment_intent_data: { metadata, statement_descriptor_suffix: STATEMENT_SUFFIX },
    },
  });
  // Only ever send buyers to a Stripe-hosted page.
  if (!session.url || !isStripeUrl(session.url)) throw new Error(`Refusing non-Stripe checkout URL: ${session.url}`);
  return { id: session.id, checkoutUrl: session.url };
}

export function getStripeSession(id: string) {
  return call<StripeSession>(`/checkout/sessions/${encodeURIComponent(id)}`);
}

/** What a paid Checkout Session really brought in: its balance transaction (amount in cents, after Stripe's
 *  conversion when there was one, and its currency). null when not known yet. */
export async function stripeBalance(id: string): Promise<{ amount: number; currency: string } | null> {
  type Bt = { amount: number; currency: string };
  type Charge = { balance_transaction?: Bt | string | null };
  const s = await call<{ payment_intent?: { latest_charge?: Charge | string | null } | string | null }>(
    `/checkout/sessions/${encodeURIComponent(id)}?expand[]=payment_intent.latest_charge.balance_transaction`,
  );
  const pi = s.payment_intent && typeof s.payment_intent === 'object' ? s.payment_intent : null;
  const charge = pi?.latest_charge && typeof pi.latest_charge === 'object' ? pi.latest_charge : null;
  const bt = charge?.balance_transaction && typeof charge.balance_transaction === 'object' ? charge.balance_transaction : null;
  return bt ? { amount: bt.amount, currency: bt.currency } : null;
}

/**
 * Money really kept (23/11), read from Stripe itself: live session complete and paid, charge succeeded, nothing
 * refunded, no dispute. The site only hears about payments, not about refunds made in the Stripe dashboard, so its own
 * "paid" is not enough before writing to someone as a client.
 */
export async function stripePaidAndKept(id: string): Promise<boolean> {
  if (!STRIPE_SESSION_RE.test(id) || !id.startsWith('cs_live_')) return false;
  type Charge = { status?: string; paid?: boolean; refunded?: boolean; amount_refunded?: number; disputed?: boolean };
  const s = await call<StripeSession & { payment_intent?: { status?: string; latest_charge?: Charge | string | null } | string | null }>(
    `/checkout/sessions/${encodeURIComponent(id)}?expand[]=payment_intent.latest_charge`,
  );
  const pi = s.payment_intent && typeof s.payment_intent === 'object' ? s.payment_intent : null;
  const charge = pi?.latest_charge && typeof pi.latest_charge === 'object' ? pi.latest_charge : null;
  return Boolean(
    s.livemode && s.status === 'complete' && s.payment_status === 'paid' && s.metadata?.app === STRIPE_APP &&
      pi?.status === 'succeeded' && charge && charge.status === 'succeeded' && charge.paid &&
      !charge.refunded && !charge.amount_refunded && !charge.disputed,
  );
}

export function isStripeUrl(href: string) {
  try {
    const { protocol, hostname } = new URL(href);
    return protocol === 'https:' && (hostname === 'checkout.stripe.com' || hostname.endsWith('.stripe.com'));
  } catch {
    return false;
  }
}

/** Checks the Stripe-Signature header of a webhook call (5 minutes tolerance). */
export function validStripeSignature(rawBody: string, header: string | null, secret: string) {
  const parts = String(header ?? '').split(',').map((kv) => kv.split('='));
  const t = Number(parts.find(([k]) => k === 't')?.[1]);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  return parts
    .filter(([k, v]) => k === 'v1' && v?.length === expected.length)
    .some(([, v]) => timingSafeEqual(Buffer.from(v), Buffer.from(expected)));
}
