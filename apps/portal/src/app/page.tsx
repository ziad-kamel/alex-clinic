import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { LoginForm } from '@/components/LoginForm';
import { getClinicName } from '@/lib/clinic';
import { getPortalSession } from '@/lib/session';

export default async function LoginPage() {
  const session = await getPortalSession();
  if (session) redirect('/results');

  const [locale, t, tCommon] = await Promise.all([
    getLocale(),
    getTranslations('login'),
    getTranslations('common'),
  ]);
  const clinicName = getClinicName(locale, tCommon('clinicName'));
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-6">
      <header className="flex items-center justify-between">
        <span className="font-bold text-teal-800">{clinicName}</span>
        <LanguageSwitcher />
      </header>
      <section className="my-auto w-full max-w-md self-center rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
        <div className="mb-7">
          <p className="text-xs font-bold uppercase tracking-wider text-teal-700">
            {clinicName}
          </p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">
            {t('title')}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {t('subtitle')}
          </p>
        </div>
        <LoginForm />
      </section>
      <footer className="pb-2 text-center text-xs text-slate-400">
        {clinicName}
      </footer>
    </main>
  );
}
