import type { MetadataRoute } from 'next';
import { PROGRAMS } from '@/lib/catalog';
import { LOCALES, type Locale } from '@/lib/locales';
import { siteUrl } from '@/lib/site';

// Public pages only.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const locales = Object.keys(LOCALES) as Locale[];
  // (23/11) x-default : la page que Google montre quand aucune langue ne correspond au visiteur.
  const languages = { ...Object.fromEntries(locales.map((l) => [LOCALES[l].intl, `${base}/${LOCALES[l].slug}`])), 'x-default': `${base}/school` };
  return [
    { url: `${base}/`, changeFrequency: 'weekly', priority: 0.5 },
    ...locales.map((l) => ({ url: `${base}/${LOCALES[l].slug}`, changeFrequency: 'weekly' as const, priority: 1, alternates: { languages } })),
    // (23/11) Une page par certification du catalogue (ChatGPT, Claude, Copilot…) : elles existaient, Google ne les connaissait pas.
    ...PROGRAMS.filter((p) => !p.href).map((p) => ({ url: `${base}/certifications/${p.slug}`, changeFrequency: 'monthly' as const, priority: 0.7 })),
  ];
}
