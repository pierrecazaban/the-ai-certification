import { cookies, headers } from 'next/headers';
import { DEFAULT_LOCALE, isLocale, type Locale } from './locales';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Language of pages shared by every version (register, confirmation, legal), from `?lang=`. */
export async function localeFromSearch(searchParams: SearchParams): Promise<Locale> {
  const lang = (await searchParams).lang;
  return isLocale(lang) ? lang : DEFAULT_LOCALE;
}

/**
 * Visitor's language when no slug carries it: the English escape cookie wins (someone who chose
 * English stays in English), then the country (France/Monaco → French), otherwise the default.
 */
export async function geoLocale(): Promise<Locale> {
  try {
    if ((await cookies()).get('site_lang')?.value === 'en') return 'en-us';
    const country = ((await headers()).get('x-vercel-ip-country') ?? '').toUpperCase();
    return country === 'FR' || country === 'MC' ? 'fr' : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

/** Shared pages with no slug (e.g. /support): an explicit `?lang=` wins, otherwise the visitor's country. */
export async function localeFromSearchOrGeo(searchParams: SearchParams): Promise<Locale> {
  const lang = (await searchParams).lang;
  if (isLocale(lang)) return lang;
  return geoLocale();
}
