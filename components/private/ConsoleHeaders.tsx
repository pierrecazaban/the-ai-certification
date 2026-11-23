import Link from 'next/link';
import type { ReactNode } from 'react';
import { shownId, type User } from '@/lib/auth';
import AccountMenu from '@/components/private/AccountMenu';
import ConsoleBrand from '@/components/private/ConsoleBrand';
import ToContactBadge from '@/components/private/ToContactBadge';
import Header from '@/components/Header';
import LanguageSwitch from '@/components/learning/LanguageSwitch';
import { PRIVATE_SLUGS } from '@/lib/private';
import type { Locale } from '@/lib/locales';

// The console headers, kept on every page an admin or an ambassador opens (also when they follow a course),
// so they never lose their way back.

export const ADMIN_TABS = [
  { id: 'apercu', label: 'Dashboard' },
  { id: 'tickets', label: 'Tickets' },
  { id: 'avis', label: 'Avis' },
  { id: 'prospection', label: 'Prospection' },
] as const;

const team = `/${PRIVATE_SLUGS.ambassador}`;
const pro = `/${PRIVATE_SLUGS.admin}`;

/** /admin header. `view` marks where the admin is: the console itself, the student view or the ambassador view. */
export function AdminHeader({ admin, tab, view = 'pro', actions }: { admin: User; tab?: string; view?: 'pro' | 'student' | 'ambassador'; actions?: ReactNode }) {
  const views = [
    { href: pro, label: 'Admin view', id: 'pro' },
    { href: '/space', label: 'Student view', id: 'student' },
    { href: team, label: 'Ambassador view', id: 'ambassador' },
  ];
  return (
    <header className="cx-header cx-header-admin">
      {/* Plus de redirection /admin → /ambassador (23/11) : recharger /admin reste sur /admin. L'app et la connexion
          admin arrivent déjà sur la vue ambassadeur via le manifeste (start_url) et homePath. */}
      <div className="container cx-header-row">
        <ConsoleBrand href={pro} badge="Admin" />
        <div className="cx-who">
          <div className="cx-views">
            {actions}
            {views.map((v) => (
              // In the settings, only the gear is highlighted.
              <Link key={v.id} className="cx-view" href={v.href} aria-current={view === v.id && !(v.id === 'pro' && tab === 'reglages') ? 'page' : undefined}>{v.label}{v.id === 'pro' && view !== 'pro' && <ToContactBadge />}</Link>
            ))}
          </div>
          {/* Settings: a gear by the account menu rather than a section tab. */}
          <Link className="cx-gear" href={`${pro}?tab=reglages`} aria-label="Settings" title="Settings" aria-current={view === 'pro' && tab === 'reglages' ? 'page' : undefined}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </Link>
          <AccountMenu name={admin.first_name} email={shownId(admin)} role="Administrator" signOut="Sign out" links={[...views, { href: `${pro}?tab=reglages`, label: 'Settings' }, { href: '/', label: 'Back to the site' }]} />
        </div>
      </div>
      {/* The /admin sections sit on their own band, apart from the views; only in the admin view itself
          (in the student and ambassador views, “Admin view” leads back to them). */}
      {view === 'pro' && (
        <div className="cx-band">
          <nav className="container cx-tabs" aria-label="Sections">
            {ADMIN_TABS.map((t) => (
              <Link key={t.id} href={`${pro}?tab=${t.id}`} aria-current={tab === t.id ? 'page' : undefined}>{t.label}{t.id === 'prospection' && <ToContactBadge />}</Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}

/** Ambassador space header; `tab` is the current section, or "course" while they try the student course. */
export function TeamHeader({ user, tab, actions }: { user: User; tab: string; actions?: ReactNode }) {
  const course = { href: '/space', label: 'Try the course' };
  // Les deux vues côte à côte (22/11) : depuis le cours, « Ambassador space » ramène à l'espace ambassadeur.
  const space = { href: team, label: 'Ambassador space' };
  return (
    <header className="cx-header cx-header-admin cx-header-team">
      <div className="container cx-header-row">
        <ConsoleBrand href={team} badge="Ambassador" />
        <div className="cx-who">
          <div className="cx-views">
            {actions}
            <Link className="cx-view" href={space.href} aria-current={tab !== 'course' ? 'page' : undefined}>{space.label}</Link>
            <Link className="cx-view" href={course.href} aria-current={tab === 'course' ? 'page' : undefined}>{course.label}</Link>
          </div>
          <AccountMenu name={user.first_name} email={shownId(user)} role="Ambassador" signOut="Sign out" links={[{ href: team, label: 'Ambassador space' }, course]} />
        </div>
      </div>
    </header>
  );
}

/** Top of the learner pages: the console header for admins and ambassadors, the site header for students. */
export function LearnerHeader({ user, locale, actions }: { user: User; locale: Locale; actions?: ReactNode }) {
  // The course language switch, on every learner page whatever the role.
  const all = <>{actions}<LanguageSwitch locale={locale} /></>;
  // Pages du cours (22/11) : en-tête clair, dans le style de l'espace élève (.learn-light).
  if (user.role === 'admin') return <div className="learn-light"><AdminHeader admin={user} view="student" actions={all} /></div>;
  if (user.role === 'ambassador') return <div className="learn-light"><TeamHeader user={user} tab="course" actions={all} /></div>;
  return <div className="learn-light"><Header locale={locale} minimal actions={all} /></div>;
}
