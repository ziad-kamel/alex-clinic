'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

export function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations('common');
  const router = useRouter();

  const changeLocale = (nextLocale: 'en' | 'ar') => {
    document.cookie = `NEXT_LOCALE=${nextLocale}; Path=/; Max-Age=31536000; SameSite=Lax`;
    router.refresh();
  };

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-slate-500">{t('language')}:</span>
      <button
        type="button"
        onClick={() => changeLocale('en')}
        aria-pressed={locale === 'en'}
        className={`rounded px-2 py-1 ${locale === 'en' ? 'bg-teal-100 font-bold text-teal-800' : 'text-slate-600 hover:bg-slate-100'}`}
      >
        {t('english')}
      </button>
      <button
        type="button"
        onClick={() => changeLocale('ar')}
        aria-pressed={locale === 'ar'}
        className={`rounded px-2 py-1 ${locale === 'ar' ? 'bg-teal-100 font-bold text-teal-800' : 'text-slate-600 hover:bg-slate-100'}`}
      >
        {t('arabic')}
      </button>
    </div>
  );
}
