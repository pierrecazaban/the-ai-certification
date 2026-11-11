import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { localeFromSearch } from '@/lib/requestLocale';
import { company } from '@/lib/company';

export const metadata = { title: 'Legal notice | The AI Certification' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function LegalNotice({ searchParams }: Props) {
  const locale = await localeFromSearch(searchParams);
  return (
    <>
      <Header locale={locale} />
      <main id="main">
        <section>
          <div className="container" style={{ maxWidth: 820 }}>
            <h1>Legal notice</h1>

            <h2 style={{ fontSize: 24, marginTop: 40 }}>Publisher</h2>
            <p>
              {company.name && (
                <>
                  The website and The AI Certification certification program are operated by <strong>{company.name}</strong>,{' '}
                  {company.legalForm}.
                  <br />
                </>
              )}
              {company.siren && <>SIREN: {company.siren}<br /></>}
              {company.address && <>Address: {company.address}<br /></>}
              Email: <a href={`mailto:${company.email}`}>{company.email}</a>
              <br />
              {company.vatExempt
                ? 'VAT not applicable, article 293 B of the French General Tax Code (CGI).'
                : `VAT number: ${company.vatNumber || '[VAT NUMBER]'}`}
            </p>
            {company.publisher && <p>Publication director: {company.publisher}</p>}

            <h2 style={{ fontSize: 24, marginTop: 40 }}>Hosting</h2>
            <p>{company.host}</p>

            <h2 style={{ fontSize: 24, marginTop: 40 }}>Payments</h2>
            <p>
              Payments are processed by Stripe Payments Europe, Ltd., 1 Grand Canal Street Lower, Grand Canal Dock, Dublin,
              D02 H210, Ireland. Card details are entered directly with Stripe and never pass through our servers.
            </p>
          </div>
        </section>
      </main>
      <Footer locale={locale} />
    </>
  );
}
