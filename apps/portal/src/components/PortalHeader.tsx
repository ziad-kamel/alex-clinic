'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { LanguageSwitcher } from './LanguageSwitcher';
import { getClinicName } from '@/lib/clinic';

export function PortalHeader({ patientName }: { patientName: string }) {
  const t = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/');
    router.refresh();
  };

  return (
    <header className="no-print border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-4">
        <div>
          <Link href="/results" className="text-lg font-bold text-teal-800">
            {getClinicName(locale, t('clinicName'))}
          </Link>
          <p className="mt-0.5 text-xs text-slate-500">{patientName}</p>
        </div>
        <nav className="flex flex-wrap items-center gap-3">
          <Link
            href="/results"
            className="text-xs font-semibold text-slate-700 hover:text-teal-800"
          >
            {t('backToResults')}
          </Link>
          <Link
            href="/book-appointment"
            className="text-xs font-semibold text-teal-800 hover:underline"
          >
            {t('bookAppointment')}
          </Link>
          <Link
            href="/change-password"
            className="text-xs font-semibold text-slate-700 hover:text-teal-800"
          >
            {t('changePassword')}
          </Link>
          <LanguageSwitcher />
          <button
            type="button"
            onClick={logout}
            className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            {t('logout')}
          </button>
        </nav>
      </div>
    </header>
  );
}
