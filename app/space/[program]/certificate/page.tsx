import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LearnerHeader } from '@/components/private/ConsoleHeaders';
import CourseBar from '@/components/learning/CourseBar';
import PrintButton from '@/components/learning/PrintButton';
import { requireLearner } from '@/components/learning/learner';
import { learn } from '@/lib/i18n/learn';
import { LOCALES } from '@/lib/locales';
import { siteUrl } from '@/lib/site';
import Certificate from '@/components/learning/Certificate';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'The AI Certification', robots: { index: false, follow: false } };

const base = () => siteUrl();

// The learner's certificate: printable, with a one-click "add to LinkedIn" and the fields to copy.
type Props = { params: Promise<{ program: string }> };

export default async function CertificatePage({ params }: Props) {
  const { program } = await params;
  const { user, progress } = await requireLearner(program);
  const cert = progress.certificate;
  if (!cert) redirect('/space');
  const { locale, course } = progress;
  const l = learn(locale);
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
      <main id="main" className="register hero-bands bands-clip">
        <div className="container" style={{ maxWidth: 900 }}>
          <div className="no-print"><CourseBar program={program} progress={progress} current="exam" l={l} /></div>
                    <div className="sp-hero sp-hero-module no-print">
            <div className="sp-hero-text">
              <h1 style={{ margin: 0 }}>{l.certTitle}</h1>
              <p className="lead" style={{ margin: '10px 0 0' }}>{l.certLead}</p>
            </div>
            <img className="sp-hero-mascot" src="/assets/course/certified.webp" alt="" width={200} height={200} />
          </div>

          {/* A4 landscape on paper; the page's other blocks are hidden when printing. */}
          <style>{'@page { size: A4 landscape; margin: 10mm; }'}</style>
          <Certificate holder={cert.holder_name} title={course.title} reference={cert.reference} issuedOn={issuedOn} verifyUrl={url} l={l} />

          <p className="no-print" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <PrintButton label={l.print} />
          </p>

          <section className="space-module no-print">
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
