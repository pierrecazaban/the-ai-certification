import { testSettingAction } from '@/lib/privateActions';
import { settingsOverview } from '@/lib/settings';
import { paymentsMode } from '@/lib/payments';
import { emailConfigured } from '@/lib/email';
import { siteUrl } from '@/lib/site';
import LoginArrivals from '@/components/private/LoginArrivals';
import Reconciliation from '@/components/private/Reconciliation';

// Admin settings, read-only (15/11): which keys are set in Vercel, and a test for each. No key can be changed here.
export default async function Settings({ params }: { params: Record<string, string | string[] | undefined> }) {
  const rows = await settingsOverview();
  const tested = String(params.test ?? '');
  const ok = params.ok === '1';
  const detail = String(params.detail ?? '');
  const [mode, mail] = await Promise.all([paymentsMode(), emailConfigured()]);
  const name = 'Stripe';
  // Payments need both: a provider to take the money, e-mail to send the buyer their confirmation.
  const payments = !mode
    ? { tone: 'tone-warn', label: 'Off', text: 'No Stripe secret key in Vercel (STRIPE_SECRET_KEY). Until it is set there, the payment button says payments are unavailable.' }
    : !mail
      ? { tone: 'tone-warn', label: 'Blocked', text: `The ${name} key is set, but the Resend key is missing: no payment is taken while the buyer cannot receive their confirmation.` }
      : mode === 'test'
        ? { tone: 'tone-info', label: 'Test mode', text: `Payments go through ${name} in test mode: no money is taken, and each test payment opens a real access. Set the live key in Vercel to sell.` }
        : { tone: 'tone-ok', label: 'Live', text: `Real payments: buyers pay on ${name}’s secure page, then come back to The AI Certification with their access.` };

  return (
    <>
      <section className="cx-card">
        <h2>Settings</h2>
        <p className="help">
          The service keys can no longer be changed from this page: they are set only in Vercel (Project → Settings →
          Environment Variables), then the site is redeployed. Here you only see whether each key is set, and can test it.
        </p>
      </section>
      <section className="cx-card">
        <div className="cx-toolbar">
          <h2 style={{ margin: 0 }}>Payments</h2>
          <span className={`cx-badge ${payments.tone}`}>{payments.label}</span>
        </div>
        <p className="help">{payments.text}</p>
        <p className="help">
          In Stripe → Developers → Webhooks, the endpoint <code>{siteUrl()}/api/stripe/webhook</code> (events
          checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed and
          checkout.session.expired) grants access even if the buyer closes the page. Its signing secret is set in Vercel (STRIPE_WEBHOOK_SECRET).
        </p>
      </section>
      {rows.map((r) => (
        <section key={r.key} className="cx-card cx-setting">
          <div className="cx-toolbar">
            <h2 style={{ margin: 0 }}>{r.label}</h2>
            {r.source ? <span className="cx-badge tone-ok">Set</span> : <span className="cx-badge tone-warn">To set</span>}
          </div>
          <p className="help">{r.help}</p>
          {r.masked && (
            <p className="cx-setting-current">
              Current: <code>{r.masked}</code> <small>({r.source === 'admin' ? 'connected with Google' : 'set in Vercel'})</small>
            </p>
          )}
          {tested === r.key && <p className={`price-alert${ok ? ' learn-pass' : ''}`} role="status">{ok ? '✓ ' : '✗ '}{detail}</p>}
          {r.source && (
            <form action={testSettingAction} className="cx-setting-actions">
              <input type="hidden" name="key" value={r.key} />
              <button className="btn btn-sm" type="submit">Test</button>
            </form>
          )}
        </section>
      ))}
      <Reconciliation />
      <LoginArrivals />
    </>
  );
}
