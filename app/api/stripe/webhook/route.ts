import { NextRequest, NextResponse } from 'next/server';
import { syncPayment } from '@/lib/school';
import { setting } from '@/lib/settings';
import { STRIPE_APP, STRIPE_SESSION_RE, StripeError, validStripeSignature } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

// Stripe → Developers → Webhooks: endpoint {site}/api/stripe/webhook with the checkout.session.* events.
// Only the Checkout Session id is taken from the event: the session is always read again from Stripe.
// The Stripe account may serve other sites too: sessions not made by this site are ignored.
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!(await setting('STRIPE_SECRET_KEY'))) return new NextResponse('ok');
  const secret = await setting('STRIPE_WEBHOOK_SECRET');
  if (secret && !validStripeSignature(raw, req.headers.get('stripe-signature'), secret)) {
    return new NextResponse('bad signature', { status: 400 });
  }

  let event: { type?: string; data?: { object?: { id?: string; metadata?: Record<string, string> } } };
  try {
    event = JSON.parse(raw);
  } catch {
    return new NextResponse('bad request', { status: 400 });
  }
  const session = event.data?.object;
  if (!String(event.type ?? '').startsWith('checkout.session.') || session?.metadata?.app !== STRIPE_APP) {
    return new NextResponse('ok');
  }
  const id = String(session.id ?? '');
  if (!STRIPE_SESSION_RE.test(id)) return new NextResponse('ok');

  try {
    await syncPayment(id);
  } catch (err) {
    // A session made with another key (test before live) does not exist for this one: nothing to retry.
    if (err instanceof StripeError && err.status === 404) return new NextResponse('ok');
    console.error('stripe webhook', err);
    return new NextResponse('error', { status: 500 }); // Stripe retries for up to 3 days
  }
  return new NextResponse('ok');
}
