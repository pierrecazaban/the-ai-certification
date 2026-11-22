'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LOCALES, type Locale } from '@/lib/locales';

// Language of the course, chosen by the learner (20/11). Only the languages in which the latest version of the
// student course is written: switching to a language still on v1 (es, it, de) would reset the progress.
const CHOICES = [
  { locale: 'fr', label: 'FR', name: 'Français' },
  { locale: 'en-us', label: 'EN', name: 'English' },
] as const;

export const SWITCHABLE = (locale: Locale) => locale === 'fr' || locale === 'en-us' || locale === 'en-ca';

export default function LanguageSwitch({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (!SWITCHABLE(locale)) return null;
  const current = LOCALES[locale].lang;

  async function choose(next: Locale) {
    if (busy || LOCALES[next].lang === current) return;
    setBusy(true);
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set_locale', locale: next }),
    }).catch(() => null);
    if (res?.ok) router.refresh();
    setBusy(false);
  }

  return (
    <div className="lang-switch" role="group" aria-label={current === 'fr' ? 'Langue de la formation' : 'Course language'}>
      {CHOICES.map((c) => (
        <button key={c.locale} type="button" lang={LOCALES[c.locale].lang} title={c.name} aria-pressed={LOCALES[c.locale].lang === current} disabled={busy} onClick={() => choose(c.locale)}>
          {c.label}
        </button>
      ))}
    </div>
  );
}
