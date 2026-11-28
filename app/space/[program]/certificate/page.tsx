import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LearnerHeader } from '@/components/private/ConsoleHeaders';
import CourseBar from '@/components/learning/CourseBar';
import PrintButton from '@/components/learning/PrintButton';
import { requireLearner } from '@/components/learning/learner';
import { learn } from '@/lib/i18n/learn';
import { LOCALES } from '@/lib/locales';
import { siteUrl, SITE_DOMAIN } from '@/lib/site';
import { RATES } from '@/lib/team';
import { getLead } from '@/lib/ambassadorLeads';
import Certificate from '@/components/learning/Certificate';
import RateCertificate from '@/components/learning/RateCertificate';
import CertifyFinish from '@/components/learning/CertifyFinish';
import AmbassadorAsk from '@/components/learning/AmbassadorAsk';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'The AI Certification', robots: { index: false, follow: false } };

const base = () => siteUrl();

// The learner's certificate: printable, with a one-click "add to LinkedIn" and the fields to copy.
// Since 24/11 it comes at the end of a short path, one step on screen at a time, decided here on the server:
// rate the course (stars and a review) → Trustpilot (5 stars only, until its button was clicked) → "become an
// ambassador?" (asked once per learner) → the certificate and LinkedIn. Nothing of the certificate is sent before.
type Props = { params: Promise<{ program: string }>; searchParams: Promise<{ rate?: string; rated?: string; amb?: string }> };

export default async function CertificatePage({ params, searchParams }: Props) {
  const { program } = await params;
  const query = await searchParams;
  const { user, progress } = await requireLearner(program, `/space/${program}/certificate`);
  const cert = progress.certificate;
  if (!cert) redirect('/space');
  const { locale, course } = progress;
  const l = learn(locale);

  // An ambassador is not asked whether they want to become one; an admin is, to test the path.
  const asked = user.role !== 'ambassador';
  const step: 'rate' | 'trustpilot' | 'ambassador' | 'certificate' =
    cert.rating == null ? 'rate'
    : Number(cert.rating) === 5 && !cert.tp_clicked_at ? 'trustpilot'
    : asked && !(await getLead(user.id)) ? 'ambassador'
    : 'certificate';

  const header = (title: string, lead: string) => (
    <>
      <div className="no-print"><CourseBar program={program} progress={progress} current="exam" l={l} /></div>
      <div className="sp-hero sp-hero-module no-print">
        <div className="sp-hero-text">
          <h1 style={{ margin: 0 }}>{title}</h1>
          <p className="lead" style={{ margin: '10px 0 0' }}>{lead}</p>
        </div>
        <img className="sp-hero-mascot" src="/assets/course/certified.webp" alt="" width={200} height={200} />
      </div>
    </>
  );

  if (step !== 'certificate') {
    const rate = (RATES.owner / 100).toLocaleString(LOCALES[locale].intl);
    return (
      <div lang={LOCALES[locale].lang}>
        <LearnerHeader user={user} locale={locale} />
        <main id="main" className="register hero-bands bands-clip sp-page">
          <div className="container" style={{ maxWidth: 900 }}>
            {header(l.certLockedTitle, l.certLockedLead)}
            <div id="etape" className="cert-step">
              {step === 'rate' ? (
                <div className="space-module">
                  <p>{l.rateLead}</p>
                  <RateCertificate program={program} l={l} missing={query.rate === 'missing'} short={query.rate === 'short'} />
                </div>
              ) : (
                <>
                  {query.rated === '1' && <p className="help" role="status">{l.rateThanks}</p>}
                  {/* Étape Trustpilot seulement pour une note de 5/5 (23/11, choix de l'owner informé des modalités). */}
                  {step === 'trustpilot' ? (
                    <CertifyFinish
                      t={{ title: l.trustpilotTitle, button: l.trustpilotButton, copyBtn: l.trustpilotCopyBtn, copied: l.trustpilotCopied, thanks: l.trustpilotThanks, next: l.rateSubmit }}
                      domain={SITE_DOMAIN} comment={cert.rating_comment ?? ''} program={program}
                    />
                  ) : (
                    <AmbassadorAsk
                      t={{
                        title: l.ambTitle, pitch: l.ambPitch, offer: l.ambOffer(rate), yes: l.ambYes, no: l.ambNo, network: l.ambNetwork, handle: l.ambHandle,
                        handlePlaceholder: l.ambHandlePlaceholder, schools: l.ambSchools, submit: l.ambSubmit, missing: l.ambMissing, note: l.ambNote,
                      }}
                      program={program} missing={query.amb === 'missing'}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </main>
      </div>
    );
  }

  const issued = new Date(cert.issued_at);
  const url = `${base()}/verify/${cert.reference}`;
  // A certificate shows the full date, year included.
  const issuedOn = issued.toLocaleDateString(LOCALES[locale].intl, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const linkedin = `https://www.linkedin.com/profile/add?${new URLSearchParams({
    startTask: 'CERTIFICATION_NAME',
    name: course.title,
    organizationName: 'The AI Certification',
    issueYear: String(issued.getUTCFullYear()),
    issueMonth: String(issued.getUTCMonth() + 1),
    certUrl: url,
    certId: cert.reference,
  })}`;

  return (
    <div lang={LOCALES[locale].lang}>
      <LearnerHeader user={user} locale={locale} />
      <main id="main" className="register hero-bands bands-clip sp-page">
        <div className="container" style={{ maxWidth: 900 }}>
          {header(l.certTitle, l.certLead)}

          {/* A4 landscape on paper; the page's other blocks are hidden when printing. */}
          <style>{'@page { size: A4 landscape; margin: 10mm; }'}</style>
          <Certificate holder={cert.holder_name} title={course.title} reference={cert.reference} issuedOn={issuedOn} verifyUrl={url} l={l} />

          <p className="no-print" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <PrintButton label={l.print} />
          </p>

          <section id="linkedin" className="space-module no-print">
            <h2>{l.linkedinTitle}</h2>
            <p>{l.linkedinLead}</p>
            <p><a className="btn btn-green" href={linkedin} target="_blank" rel="noreferrer">{l.linkedinButton}</a></p>
            <p className="help">{l.linkedinManual}</p>
            <ol>{l.linkedinSteps.map((s) => <li key={s}>{s}</li>)}</ol>
            <div className="summary">
              <dl>
                <div><dt>{l.fieldName}</dt><dd>{course.title}</dd></div>
                <div><dt>{l.fieldOrg}</dt><dd>The AI Certification</dd></div>
                <div><dt>{l.fieldIssue}</dt><dd>{issuedOn}</dd></div>
                <div><dt>{l.fieldId}</dt><dd>{cert.reference}</dd></div>
                <div><dt>{l.fieldUrl}</dt><dd>{url}</dd></div>
              </dl>
            </div>
            <p className="help">{l.linkedinPost}</p>
          </section>
        </div>
      </main>
    </div>
  );
}
