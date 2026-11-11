import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { sendTestEmail } from './email';
import { checkStripeKey, describeStripeCheck } from './stripe';
import { setting, type SettingKey } from './settings';

// "Tester" buttons of the admin settings: one real, harmless call per service.
export async function testSetting(key: SettingKey, adminEmail: string): Promise<{ ok: boolean; detail: string }> {
  try {
    if (key === 'STRIPE_SECRET_KEY') {
      const apiKey = await setting('STRIPE_SECRET_KEY');
      if (!apiKey) return { ok: false, detail: 'No key saved.' };
      const check = await checkStripeKey(apiKey);
      return { ok: check.ok, detail: describeStripeCheck(check) };
    }
    if (key === 'STRIPE_WEBHOOK_SECRET') {
      const secret = await setting('STRIPE_WEBHOOK_SECRET');
      if (!secret) return { ok: false, detail: 'No secret saved: payment notices are still accepted, but always checked again with Stripe.' };
      return /^whsec_[A-Za-z0-9]{20,}$/.test(secret)
        ? { ok: true, detail: 'Secret in the right format. Stripe → Developers → Webhooks shows whether its notices are delivered.' }
        : { ok: false, detail: 'This is not a webhook signing secret (it starts with whsec_).' };
    }
    if (key === 'RESEND_API_KEY' || key === 'EMAIL_FROM') {
      const status = await sendTestEmail(adminEmail);
      return status === 'sent'
        ? { ok: true, detail: `Test email sent to ${adminEmail}.` }
        : { ok: false, detail: 'The email was not sent: check the Resend key and that the sender’s domain is verified in Resend.' };
    }
    if (key === 'ANTHROPIC_API_KEY') {
      const apiKey = await setting('ANTHROPIC_API_KEY');
      if (!apiKey) return { ok: false, detail: 'No key saved.' };
      await new Anthropic({ apiKey }).models.list({ limit: 1 });
      return { ok: true, detail: 'Valid key: the chatbot is live on the site.' };
    }
    return { ok: false, detail: 'Unknown setting.' };
  } catch (error) {
    return { ok: false, detail: error instanceof Anthropic.AuthenticationError ? 'Anthropic refused the key.' : 'The test failed. Check the key.' };
  }
}
