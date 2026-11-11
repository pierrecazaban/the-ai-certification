import 'server-only';
import { createStripeCheckout, getStripeSession, isStripeUrl, stripeEnabled, stripeMode } from './stripe';

// Payments go through Stripe Checkout. This file is what the rest of the site uses.

export type Payment = {
  id: string;
  status: 'open' | 'paid' | 'expired';
  paidAt?: string;
  metadata?: { registration_id?: string; app?: string };
  /** Where the buyer pays, while the payment is still open. */
  checkoutUrl?: string;
};

export const paymentsEnabled = stripeEnabled;

/** "test", "live" or null. */
export const paymentsMode = stripeMode;

/** The mock payment page only exists in development without a Stripe key. */
export async function mockPaymentsEnabled() {
  return process.env.NODE_ENV !== 'production' && !(await stripeEnabled());
}

export function createPayment(input: {
  amountCents: number;
  currency: string;
  description: string;
  /** Where the buyer comes back after paying. */
  redirectUrl: string;
  /** Where the buyer comes back after giving up on the Stripe page. */
  cancelUrl: string;
  registrationId: string;
  reference: string;
  email?: string;
  locale?: string;
}) {
  return createStripeCheckout({ ...input, successUrl: input.redirectUrl });
}

export async function getPayment(id: string): Promise<Payment> {
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

export const isCheckoutUrl = isStripeUrl;
