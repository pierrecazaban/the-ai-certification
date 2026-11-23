import { sql } from '@/lib/db';
import { LOCALES, type Locale } from '@/lib/locales';
import { siteUrl } from '@/lib/site';

// Les notes des certifiés sur la page étudiants (23/11) : visibles pour le visiteur ET déclarées à Google (JSON-LD
// « Course » avec aggregateRating), pour que les étoiles puissent s'afficher sous le résultat de recherche.
// Règles de Google : la note déclarée doit être celle qu'on lit sur la page, calculée sur de vrais avis, et porter sur la
// formation (pas sur l'entreprise). Sans aucun avis, rien n'est affiché ni déclaré : la formation reste décrite.
const MIN = 1; // (23/11) Pierre veut la voir tout de suite ; remonter à 5 quand les avis seront nombreux

const WORDS: Record<string, { reviews: string; outOf: string }> = {
  en: { reviews: 'reviews from certified students', outOf: 'out of 5' },
  fr: { reviews: 'avis d’étudiants certifiés', outOf: 'sur 5' },
  es: { reviews: 'opiniones de estudiantes certificados', outOf: 'de 5' },
  it: { reviews: 'recensioni di studenti certificati', outOf: 'su 5' },
  de: { reviews: 'Bewertungen zertifizierter Studierender', outOf: 'von 5' },
};

export default async function CourseRating({ locale, name, description, path, priceCents, currency }: {
  locale: Locale; name: string; description: string; path: string; priceCents: number; currency: string;
}) {
  let count = 0, average = 0;
  try {
    const [r] = await sql('select count(rating)::int as n, coalesce(avg(rating), 0)::float as a from certificates where rating is not null');
    count = Number(r?.n ?? 0);
    average = Math.round(Number(r?.a ?? 0) * 10) / 10;
  } catch {
    // La page ne dépend jamais des avis : sans eux, elle s'affiche comme avant.
  }
  const rated = count >= MIN && average > 0;
  const w = WORDS[String(locale).slice(0, 2)] ?? WORDS.en;
  const shown = average.toLocaleString(LOCALES[locale].intl, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const url = `${siteUrl()}${path}`;
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name,
    description,
    url,
    inLanguage: LOCALES[locale].lang,
    provider: { '@type': 'Organization', name: 'The AI Certification', url: siteUrl() },
    offers: { '@type': 'Offer', category: 'Paid', price: (priceCents / 100).toFixed(2), priceCurrency: currency.toUpperCase(), url },
    hasCourseInstance: { '@type': 'CourseInstance', courseMode: 'Online', courseWorkload: 'PT3H' },
    ...(rated ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: average.toFixed(1), bestRating: '5', worstRating: '1', ratingCount: count } } : {}),
  };
  return (
    <>
      {rated && (
        <p className="hero-rating">
          <span className="hero-stars" role="img" aria-label={`${shown} ${w.outOf}`}>
            {[1, 2, 3, 4, 5].map((i) => <span key={i} className={i <= Math.round(average) ? 'on' : ''} aria-hidden="true">★</span>)}
          </span>
          <strong>{shown}</strong> {w.outOf} · {count.toLocaleString(LOCALES[locale].intl)} {w.reviews}
        </p>
      )}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />
    </>
  );
}
