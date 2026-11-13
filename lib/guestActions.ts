'use server';

import { redirect } from 'next/navigation';
import { joinAsGuest } from './guest';

// Sign-up form of the invite page (/invite/<code>). The code is checked again on the server.
export async function guestJoinAction(formData: FormData) {
  const code = String(formData.get('code') ?? '');
  const locale = formData.get('lang') === 'en' ? 'en-us' : 'fr';
  const result = await joinAsGuest({
    code,
    first_name: String(formData.get('first_name') ?? ''),
    last_name: String(formData.get('last_name') ?? ''),
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
    terms: formData.get('terms') === 'on',
    locale,
  });
  const lang = locale === 'fr' ? 'fr' : 'en';
  if (result.result === 'ok') redirect(`/space?lang=${locale}`);
  if (result.result === 'exists') redirect(`/invite/${encodeURIComponent(code)}?lang=${lang}&done=exists`);
  if (result.result === 'invalid') redirect(`/invite/${encodeURIComponent(code)}?lang=${lang}&error=${result.error}`);
}
