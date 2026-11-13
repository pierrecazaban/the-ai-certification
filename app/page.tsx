import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import CertBadge from '@/components/CertBadge';
import ContactForm from '@/components/ContactForm';
import { LinkedInLogo, Mark, SiteFooter, SiteHeader, TRADEMARKS } from '@/components/HomeChrome';
import { GROUPS, PROGRAMS, programBySlug, programHref } from '@/lib/catalog';
import { company } from '@/lib/company';
import { onSaleChecker } from '@/lib/visibility';
import { SITE_DOMAIN } from '@/lib/site';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'The AI Certification | Prove what you can do with AI',
  description:
    'The AI Certification designs and delivers online AI certifications for companies, schools, students and associations: ChatGPT, Claude, Copilot, prompting, automation, agents and more. A real exam, and a certificate anyone can verify.',
};

// The general home page.

const SOLUTIONS = [
  { img: '/images/team-meeting.webp', title: 'Companies', text: 'Upskill your team, with proof for each person.', points: ['Corporate rate per seat', 'Online, in five languages', 'One verifiable certificate per person'] },
  { img: '/images/laptop-work.webp', title: 'Schools & universities', text: 'A checkable credential for your students. Nothing to build.', points: ['Funded rate for students', 'Nothing to host or maintain', 'Independent from the curriculum'] },
  { img: '/images/students.webp', title: 'Students', text: 'A skill employers can check, not just a CV line.', points: ['Funded place for students', 'About three hours online', 'Ready for your LinkedIn profile'] },
  { img: '/images/volunteers.webp', title: 'Associations', text: 'Recognise what your members and volunteers learn.', points: ['Pricing for non-profits', 'Certify members and volunteers', 'The same verifiable standard'] },
];

const check = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>;
const shield = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" /><path d="M9 12l2 2 4-4" /></svg>;

// Groups shown in full; the rest go in the sideways carousel.
const FEATURED_GROUPS = 2;

function CatalogBlock({ g, isAvailable }: { g: (typeof GROUPS)[number]; isAvailable: (slug: string) => boolean }) {
  const certs = PROGRAMS.filter((c) => c.group === g.title);
  return (
    <div className="hm-block" style={{ '--g': g.color, '--g-tint': g.tint } as CSSProperties}>
      <div className="hm-block-head">
        <h3>{g.title}</h3>
        <p>{g.text}</p>
        <span>{certs.length} certification{certs.length > 1 ? 's' : ''}</span>
      </div>
      <div className={`hm-certs${certs.length === 1 ? ' is-single' : ''}`}>
        {certs.length === 1 && certs.map((c) => (
          // Alone in its block: a wide, horizontal card.
          <Link key={c.slug} href={programHref(c)} className="hm-cert-card hm-feature">
            <Mark cert={c} size={80} />
            <div className="hm-feature-body">
              <span className={`hm-status${isAvailable(c.slug) ? ' is-live' : ''}`}>{isAvailable(c.slug) ? 'Available now' : 'Coming soon'}</span>
              <h4>{c.title}</h4>
              <p>{c.text}</p>
              {c.tags && <ul className="hm-tags">{c.tags.map((t) => <li key={t}>{t}</li>)}</ul>}
            </div>
            <span className="btn btn-green hm-feature-cta">Discover →</span>
          </Link>
        ))}
        {certs.length > 1 && certs.map((c) => (
          <Link key={c.slug} href={programHref(c)} className="hm-cert-card">
            <div className="hm-cert-top">
              <Mark cert={c} />
              <span className={`hm-status${isAvailable(c.slug) ? ' is-live' : ''}`}>{isAvailable(c.slug) ? 'Available now' : 'Coming soon'}</span>
            </div>
            <h4>{c.title}</h4>
            <p>{c.text}</p>
            <span className="hm-cert-more">See the certification →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default async function Home() {
  const isAvailable = await onSaleChecker();
  return (
    <>
      <SiteHeader />

      <main id="main">
        {/* Hero */}
        <section className="hero hero-bands">
          <div className="container hm-hero">
            <div>
              <h1>Prove what you can do <span className="grad-text">with AI.</span></h1>
              <p className="lead">
                ChatGPT, Claude, Copilot, agents. Pass a real exam, get a certificate anyone can verify.
              </p>
              <div className="hm-ctas">
                <a className="btn btn-green" href="#certifications">See the certifications</a>
                <a className="btn btn-ghost" href="#contact">Talk to us</a>
              </div>
            </div>

            <div className="hm-visual">
              <Image
                className="hm-mascot"
                src="/assets/kai-laptop.png"
                alt="Kai, The AI Certification’s border collie, working on a laptop"
                width={900}
                height={900}
                sizes="(max-width: 960px) 80vw, 460px"
                priority
              />
              {/* Hand-drawn doodles around Kai */}
              <p className="note note-kai" aria-hidden="true">Hi, I’m Kai!</p>
              <svg className="doodle doodle-star-a" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                <path d="M20 3 C 21 13, 24 17, 37 20 C 25 22, 21.5 26, 20 37 C 18.5 26, 15 22, 3 20.5 C 15 18, 18.8 14, 20 3 Z" />
              </svg>
              <svg className="doodle doodle-star-b" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
                <path d="M20 4 C 21 14, 24 17, 36 20 C 25 22, 21 26, 20 36 C 19 26, 15 22, 4 20 C 15 18, 19 14, 20 4 Z" />
              </svg>
              <svg className="doodle doodle-arrow" viewBox="0 0 120 80" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M110 8 C 92 10, 70 18, 58 34 C 48 48, 50 60, 34 66 C 26 69, 18 68, 10 64" />
                <path d="M20 56 C 15 60, 12 62, 9 64 C 13 66, 17 69, 21 73" />
              </svg>
              <div className="hm-cert" aria-hidden="true">
                <CertBadge kind="ai" color="#B8862B" size={44} />
                <div>
                  <small>Certificate of completion</small>
                  <strong>AI for students</strong>
                  <span>Ref. TAC-SAMPLE · Verified</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Certifications */}
        <section className="section-alt" id="certifications">
          <div className="container">
            <div className="section-head">
              <div className="section-logo"><LinkedInLogo size={48} /></div>
              <span className="eyebrow">Certifications</span>
              <h2>Don’t just say you know AI. <span className="hl">Prove it.</span></h2>
              <p className="lead">One exam. One certificate on your LinkedIn. Checked by recruiters in seconds.</p>
            </div>
            <div className="hm-blocks">
              {GROUPS.slice(0, FEATURED_GROUPS).map((g) => <CatalogBlock key={g.title} g={g} isAvailable={isAvailable} />)}
            </div>
            {/* The other groups sit in a row you swipe or scroll sideways. */}
            <div className="hm-carousel" aria-label="More certifications">
              {GROUPS.slice(FEATURED_GROUPS).map((g) => <CatalogBlock key={g.title} g={g} isAvailable={isAvailable} />)}
            </div>
            <p className="hm-legal">{TRADEMARKS}</p>
          </div>
        </section>

        {/* LinkedIn */}
        <section className="section-dark" id="linkedin">
          <div className="container split" style={{ alignItems: 'center' }}>
            <div>
              <span className="eyebrow">Made to be shown</span>
              <h2 className="hm-li-title"><LinkedInLogo size={34} /> <span>Put it on your <span className="circled">LinkedIn</span> profile</span></h2>
              <p className="lead">
                Your certificate goes straight into LinkedIn’s Licenses &amp; certifications, with a credential ID recruiters can check.
              </p>
              <ul className="checklist">
                <li>Name, issuer, date and credential ID, ready to copy</li>
                <li>A link to the public verification page</li>
                <li>Seen by every recruiter who opens your profile</li>
              </ul>
            </div>
            <div className="note-host">
            <p className="note note-li" aria-hidden="true">recruiters see this ↓</p>
            <div className="hm-linkedin" aria-hidden="true">
              <div className="hm-linkedin-head">
                <LinkedInLogo size={24} />
                <strong>Licenses &amp; certifications</strong>
                <span>Example</span>
              </div>
              {[programBySlug('ai-at-work')!, programBySlug('chatgpt')!, programBySlug('prompt-engineering')!].map((c, i) => (
                <div key={c.title} className="hm-linkedin-row">
                  <Mark cert={c} size={46} />
                  <div>
                    <strong>{c.title}</strong>
                    <span>The AI Certification</span>
                    <small>Issued 2026 · Credential ID TAC-SAMPLE{i + 1}</small>
                    {i === 0 && <em>Show credential ↗</em>}
                  </div>
                </div>
              ))}
            </div>
            </div>
          </div>
        </section>

        {/* Solutions */}
        <section className="section-alt" id="solutions">
          <div className="container">
            <div className="section-head">
              <span className="eyebrow">Solutions</span>
              <h2>One standard for <span className="hl">everyone</span> who needs to prove a skill</h2>
            </div>
            <div className="hm-solutions">
              {SOLUTIONS.map((s) => (
                <article key={s.title} className="hm-solution">
                  <div className="hm-solution-img"><Image src={s.img} alt="" fill sizes="(max-width: 760px) 90vw, 280px" /></div>
                  <div className="hm-solution-body">
                    <h3>{s.title}</h3>
                    <p>{s.text}</p>
                    <ul>{s.points.map((p) => <li key={p}>{check}{p}</li>)}</ul>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Verification */}
        <section id="verify">
          <div className="container split" style={{ alignItems: 'center' }}>
            <div>
              <span className="eyebrow">Verification</span>
              <h2>A certificate you can <span className="circled">check</span>, not take on trust</h2>
              <p className="lead">Every certificate has its own public page. Anyone can confirm it in seconds.</p>
              <ol className="numbered" style={{ marginTop: 24 }}>
                <li><span><strong>Learn online.</strong> Short modules, real tasks.</span></li>
                <li><span><strong>Pass a real exam.</strong> Earned, never given.</span></li>
                <li><span><strong>Prove it anywhere.</strong> CV, LinkedIn, interviews.</span></li>
              </ol>
            </div>
            <div className="note-host">
            <p className="note note-verify" aria-hidden="true">anyone can check it, for free</p>
            <div className="co-browser" aria-hidden="true">
              <div className="co-browser-bar"><span /><span /><span /><p>{SITE_DOMAIN}/verify/TAC-SAMPLE</p></div>
              <div className="co-browser-body">
                <div className="co-valid">{shield}<div><strong>Valid certificate</strong><small>Sample verification page</small></div></div>
                <dl>
                  <div><dt>Certification</dt><dd>AI for students</dd></div>
                  <div><dt>Holder</dt><dd>Alex Martin</dd></div>
                  <div><dt>Reference</dt><dd>TAC-SAMPLE</dd></div>
                  <div><dt>Status</dt><dd className="ok">Active</dd></div>
                </dl>
              </div>
            </div>
            </div>
          </div>
        </section>

        {/* Ambition */}
        <section className="section-dark hm-ambition">
          <div className="container split">
            <div>
              <span className="eyebrow">Our ambition</span>
              <h2>This is the start of <span className="hl">something big.</span></h2>
            </div>
            <p className="lead">
              A certificate should be a fact you can check. We’re building that standard, one country at a time.
            </p>
          </div>
        </section>

        {/* Contact */}
        <section className="hero-bands" id="contact">
          <div className="container split">
            <div>
              <span className="eyebrow">Contact</span>
              <h2>Certify your <span className="hl">team</span>, your students or your members</h2>
              <p className="lead">Tell us what you need. We reply by email.</p>
            </div>
            <div className="card"><ContactForm /></div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
