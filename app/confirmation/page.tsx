import type { Metadata } from 'next';
import { Suspense } from 'react';
import Header from '@/components/Header';
import Confirmation from '@/components/Confirmation';
import { dict } from '@/lib/i18n';
import { LOCALES } from '@/lib/locales';
import { getCourse } from '@/lib/learning';
import { STUDENT_PROGRAM } from '@/lib/catalog';
import { localeFromSearch } from '@/lib/requestLocale';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  return { title: dict(await localeFromSearch(searchParams)).confirmation.pageTitle };
}

export default async function ConfirmationPage({ searchParams }: Props) {
  const locale = await localeFromSearch(searchParams);
  return (
    <div lang={LOCALES[locale].lang}>
      <Header locale={locale} minimal />
      <main id="main" className="register hero-bands">
        <div className="container">
          <Suspense fallback={<div className="register-card"><p>{dict(locale).confirmation.checking}</p></div>}>
            <Confirmation locale={locale} studentModules={getCourse(STUDENT_PROGRAM, locale)?.modules.length ?? 0} />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
