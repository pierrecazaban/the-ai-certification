import Link from 'next/link';
import Header from './Header';
import Footer from './Footer';
import AgentDemo from './AgentDemo';
import PriceCard from './PriceCard';
import CourseRating from './CourseRating';
import { LinkedInLogo } from './HomeChrome';
import { publicIntake } from '@/lib/school';
import { pricingFor } from '@/lib/pricing';
import { company } from '@/lib/company';
import { dict } from '@/lib/i18n';
import { formatDate, formatMoney, LOCALES, registerPath, type Locale } from '@/lib/locales';
import { SITE_DOMAIN } from '@/lib/site';

const SOURCES = [
  'https://news.microsoft.com/source/2024/05/08/microsoft-and-linkedin-release-the-2024-work-trend-index/',
  'https://www.weforum.org/publications/the-future-of-jobs-report-2025/',
  'https://learning.linkedin.com/resources/workplace-learning-report',
];

const Icon = {
  calendar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></svg>,
  code: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18" /><circle cx="6.5" cy="6.5" r=".6" fill="currentColor" /><circle cx="9" cy="6.5" r=".6" fill="currentColor" /><path d="M7 13h6M7 16h10" /></svg>,
  // Certified badge with a check, same line style as the other highlights.
  medal: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" /><path d="m9 12 2 2 4-4" /></svg>,
  bot: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="8" width="18" height="12" rx="2" /><path d="M12 8V4H8" /><path d="M2 14h2M20 14h2M15 13v2M9 13v2" /></svg>,
  shield: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" /><path d="M9 12l2 2 4-4" /></svg>,
  clock: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
};

// Canadian flag, shown next to the logo on the Canada page (/canada).
function CanadaFlag() {
  return (
    <svg className="flag-ca" viewBox="0 0 9600 4800" role="img" aria-label="Canada">
      <path fill="#d52b1e" d="M0 0h2400l99 99h4602l99-99h2400v4800h-2400l-99-99h-4602l-99 99H0z" />
      <path fill="#fff" d="M2400 0h4800v4800h-4800zm2490 4430-45-863a95 95 0 0 1 111-98l859 151-116-320a65 65 0 0 1 20-73l941-762-212-99a65 65 0 0 1-34-79l186-572-542 115a65 65 0 0 1-73-38l-105-247-423 454a65 65 0 0 1-111-57l204-1052-327 189a65 65 0 0 1-91-27l-332-652-332 652a65 65 0 0 1-91 27l-327-189 204 1052a65 65 0 0 1-111 57l-423-454-105 247a65 65 0 0 1-73 38l-542-115 186 572a65 65 0 0 1-34 79l-212 99 941 762a65 65 0 0 1 20 73l-116 320 859-151a95 95 0 0 1 111 98l-45 863z" />
    </svg>
  );
}

export default async function Landing({ locale }: { locale: Locale }) {
  const d = dict(locale);
  const p = pricingFor(locale);
  const intake = await publicIntake();
  const money = (cents: number) => formatMoney(cents, locale);
  const price = money(p.priceCents);
  const full = money(p.corporateCents);
  const funding = money(p.fundingCents);
  const starts = intake ? formatDate(intake.starts_at, locale) : null;
  const tax = p.vatExempt ? d.tax.exempt : d.tax.included;
  // Every question goes through the support form.
  const support = `${SITE_DOMAIN}/support`;
  const register = registerPath(locale);
  const q = `?lang=${locale}`;

  return (
    <div lang={LOCALES[locale].lang}>
      <Header locale={locale} />
      <main id="main">
        {/* Hero + pricing */}
        <section className="hero hero-bands">
          <div className="container hero-grid" style={{ alignItems: 'start' }}>
            <div className="hero-copy">
              <div className="section-logo">
                <LinkedInLogo size={48} />
                {locale === 'en-ca' && <CanadaFlag />}
              </div>
              <h1>{d.hero.title.split(/(?<=\.)\s+/).map((l, i) => <span key={i} className="h1-ligne">{i > 0 ? ' ' : ''}{l}</span>)}</h1>
              <p className="lead">{d.hero.lead}</p>
              <ul className="highlights">
                <li>
                  <div className="icon">{Icon.bot}</div>
                  <strong>{d.hero.modulesTitle}</strong>
                  <span>{d.hero.instant}</span>
                </li>
                <li>
                  <div className="icon">{Icon.code}</div>
                  <strong>{d.hero.codeTitle}</strong>
                  <span>{d.hero.codeSub}</span>
                </li>
                <li>
                  {/* LinkedIn, with the "certified" badge in its top-right corner. */}
                  <div className="icon icon-li">
                    <LinkedInLogo size={18} />
                    <svg className="icon-li-badge" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" fill="#0A66C2" stroke="#fff" strokeWidth="2" /><path d="m9 12 2 2 4-4" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </div>
                  <strong>{d.hero.certTitle}</strong>
                  <span>{d.hero.certSub}</span>
                </li>
              </ul>
            </div>

            <PriceCard
              locale={locale}
              price={price}
              fullPrice={full}
              funding={funding}
              taxLabel={tax}
              status={intake?.status ?? null}
              closesOn={intake?.status === 'open' ? formatDate(intake.registration_deadline, locale) : null}
            />
          </div>
        </section>

        {/* Call to action (no mascot on the student programme page) */}
        <section className="mascot-band">
          <div className="container mascot-cta no-art">
            <div>
              <h2>{d.mascot.title}</h2>
              {/* The certificate as it shows on a LinkedIn profile (illustration). */}
              <div className="hm-linkedin li-proof" aria-hidden="true">
                <div className="hm-linkedin-head">
                  <LinkedInLogo size={24} />
                  <strong>{d.mascot.liHead}</strong>
                  <span>{d.mascot.liExample}</span>
                </div>
                <div className="hm-linkedin-row">
                  <img src="/assets/mark.svg" alt="" width={46} height={46} />
                  <div>
                    <strong>{d.mascot.liCert} <svg className="li-verif" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" fill="#0A66C2" /><path d="m9 12 2 2 4-4" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg></strong>
                    <span>The AI Certification</span>
                    <small>{d.mascot.liIssued}</small>
                    <em>{d.mascot.liShow}</em>
                  </div>
                </div>
              </div>
              <p className="lead" style={{ marginBottom: 0 }}>{d.mascot.lead}</p>
            </div>
          </div>
        </section>

        {/* Career agent */}
        <section className="section-alt">
          <div className="container split">
            <div>
              <h2>{d.agent.title}</h2>
              <p className="lead">{d.agent.lead}</p>
            </div>
            <figure style={{ margin: 0 }}>
              <AgentDemo locale={locale} />
              <figcaption className="caption">{d.agent.caption}</figcaption>
            </figure>
          </div>
        </section>

        {/* Job market */}
        <section>
          <div className="container">
            <div className="section-head">
              <h2>{d.market.title}</h2>
            </div>
            <div className="grid grid-3">
              {d.market.stats.map((s, i) => (
                <article className="card" key={s.source}>
                  <p className="stat">{s.stat}</p>
                  <p className="source">
                    <strong>{d.market.source}</strong>
                    <a href={SOURCES[i]}>{s.source}</a>
                  </p>
                </article>
              ))}
            </div>
            <p className="pull">{d.market.pull}</p>
          </div>
        </section>

        {/* What you get */}
        <section className="section-alt" id="what-you-get">
          <div className="container">
            <div className="section-head">
              <h2>{d.get.title}</h2>
            </div>
            <div className="grid grid-3">
              <article className="card">
                <div className="icon">{Icon.shield}</div>
                <h3>{d.get.verifyTitle}</h3>
                <p>{d.get.verifyText(`[${SITE_DOMAIN}]`)}</p>
              </article>
              <article className="card">
                <div className="icon">{Icon.clock}</div>
                <h3>{d.get.timeTitle}</h3>
                <p>{d.get.timeText}</p>
              </article>
              <article className="card">
                <div className="icon">{Icon.medal}</div>
                <h3>{d.get.certTitle}</h3>
                <p>{d.get.certText}</p>
              </article>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works">
          <div className="container">
            <div className="section-head">
              <h2>{d.how.title}</h2>
            </div>
            <ol className="numbered">
              {d.how.steps.map((s) => (
                <li key={s.b}><span><strong>{s.b}</strong> {s.t}</span></li>
              ))}
            </ol>
          </div>
        </section>

        {/* Modules */}
        <section className="section-dark" id="modules">
          <div className="container">
            <div className="section-head">
              <h2>{d.modules.title}</h2>
            </div>
            <ol className="numbered">
              {d.modules.items.map((m) => (
                <li key={m.b}><span><strong>{m.b}</strong> {m.t}</span></li>
              ))}
            </ol>
          </div>
        </section>

        {/* Is it for you */}
        <section className="section-alt">
          <div className="container split">
            <div>
              <h2>{d.forYou.title}</h2>
            </div>
            <div>
              <p className="lead" style={{ color: 'var(--navy)' }}>{d.forYou.p1}</p>
              <p className="lead">{d.forYou.p2}</p>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq">
          <div className="container">
            <div className="section-head">
              <h2>{d.faq.title}</h2>
            </div>
            <div className="faq">
              {d.faq.items({ full, funding, price, starts, support }).map((item) => (
                <details key={item.q}>
                  <summary>{item.q}</summary>
                  <p>
                    {item.a}
                    {'link' in item && item.link && (
                      <> <Link href={`${item.link.href}${q}`}>{item.link.label}</Link></>
                    )}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Tout en bas de la page : la note des certifiés, visible ici et déclarée à Google (étoiles dans les résultats). */}
        <section className="rating-band">
          <div className="container">
            <CourseRating locale={locale} name={d.meta.title} description={d.meta.description} path={`/${LOCALES[locale].slug}`} priceCents={p.priceCents} currency={p.currency} />
          </div>
        </section>
      </main>
      <Footer locale={locale} />
    </div>
  );
}
