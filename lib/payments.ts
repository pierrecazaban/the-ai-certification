import 'server-only';
import { createPayment as createMolliePayment, getPayment as getMolliePayment, isMollieUrl, mollieEnabled, mollieMode } from './mollie';
import { createStripeCheckout, getStripeSession, isStripeUrl, STRIPE_SESSION_RE, stripeEnabled, stripeMode } from './stripe';

// One door to the payment providers. Stripe takes the payments when its key is set, Mollie otherwise.
// A payment is always read back from the provider that made it (cs_… → Stripe, tr_… → Mollie),
// so payments started before a switch still complete.

export type Payment = {
  id: string;
  status: 'open' | 'pending' | 'authorized' | 'paid' | 'canceled' | 'expired' | 'failed';
  paidAt?: string;
  metadata?: { registration_id?: string; app?: string };
  /** Where the buyer pays, while the payment is still open. */
  checkoutUrl?: string;
};

export async function paymentProvider(): Promise<'stripe' | 'mollie' | null> {
  if (await stripeEnabled()) return 'stripe';
  if (await mollieEnabled()) return 'mollie';
  return null;
}

export async function paymentsEnabled() {
  return (await paymentProvider()) !== null;
}

/** "test", "live" or null, for the provider in use. */
export async function paymentsMode() {
  const provider = await paymentProvider();
  return provider === 'stripe' ? stripeMode() : provider === 'mollie' ? mollieMode() : null;
}

/** The mock payment page only exists in development without any payment key. */
export async function mockPaymentsEnabled() {
  return process.env.NODE_ENV !== 'production' && !(await paymentsEnabled());
}

export async function createPayment(input: {
  amountCents: number;
  currency: string;
  description: string;
  /** Where the buyer comes back after paying (and, with Mollie, after giving up). */
  redirectUrl: string;
  /** Where the buyer comes back after giving up on the Stripe page. */
  cancelUrl: string;
  webhookUrl?: string;
  registrationId: string;
  reference: string;
  email?: string;
  locale?: string;
  mollieLocale?: string;
}) {
  if (await stripeEnabled()) {
    return createStripeCheckout({
      amountCents: input.amountCents,
      currency: input.currency,
      description: input.description,
      successUrl: input.redirectUrl,
      cancelUrl: input.cancelUrl,
      registrationId: input.registrationId,
      reference: input.reference,
      email: input.email,
      locale: input.locale,
    });
  }
  return createMolliePayment({
    amountCents: input.amountCents,
    currency: input.currency,
    description: input.description,
    redirectUrl: input.redirectUrl,
    webhookUrl: input.webhookUrl,
    registrationId: input.registrationId,
    locale: input.mollieLocale,
  });
}

export async function getPayment(id: string): Promise<Payment> {
  if (STRIPE_SESSION_RE.test(id)) {
    const s = await getStripeSession(id);
    const paid = s.payment_status === 'paid' || s.payment_status === 'no_payment_required';
    const status: Payment['status'] = s.status === 'complete' && paid ? 'paid' : s.status === 'expired' ? 'expired' : 'open';
    return {
      id: s.id,
      status,
      paidAt: status === 'paid' ? new Date().toISOString() : undefined,
      metadata: s.metadata,
      checkoutUrl: s.status === 'open' && s.url ? s.url : undefined,
    };
  }
  const p = await getMolliePayment(id);
  return { id: p.id, status: p.status, paidAt: p.paidAt, metadata: p.metadata, checkoutUrl: p._links.checkout?.href };
}

export function isCheckoutUrl(href: string) {
  return isStripeUrl(href) || isMollieUrl(href);
}
