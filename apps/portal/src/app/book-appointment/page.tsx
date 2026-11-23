import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { BookingWizard } from '@/components/BookingWizard';
import { getClinicName } from '@/lib/clinic';

export default async function BookAppointmentPage() {
  const [locale, t, tCommon] = await Promise.all([
    getLocale(),
    getTranslations('booking'),
    getTranslations('common'),
  ]);
  const clinicName = getClinicName(locale, locale === 'ar' ? t('clinicName') : tCommon('clinicName'));

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Link href="/" className="font-bold text-teal-800">{clinicName}</Link>
        <LanguageSwitcher />
      </header>
      <section className="mx-auto my-10 w-full max-w-2xl">
        <p className="text-xs font-bold uppercase tracking-wider text-teal-700">{clinicName}</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">{t('title')}</h1>
        <p className="mt-2 mb-7 text-sm leading-6 text-slate-600">{t('subtitle')}</p>
        <BookingWizard timeZone={process.env.CLINIC_TIMEZONE || 'Africa/Cairo'} />
        <p className="mt-5 text-center text-sm text-slate-500">
          {t('alreadyHaveAccount')}{' '}
          <Link href="/" className="font-semibold text-teal-800 hover:underline">{t('signIn')}</Link>
        </p>
      </section>
      <footer className="mt-auto pb-2 text-center text-xs text-slate-400">{clinicName}</footer>
    </main>
  );
}
