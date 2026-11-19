'use client';

import { useLocale, useTranslations } from 'next-intl';

export function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations('common');

  const toggleLanguage = () => {
    const nextLocale = locale === 'en' ? 'ar' : 'en';
    document.cookie = `NEXT_LOCALE=${nextLocale}; path=/; max-age=31536000`;
    window.location.reload();
  };

  return (
    <button
      onClick={toggleLanguage}
      className="px-3 py-1.5 text-sm font-medium border border-slate-300 rounded-md bg-white hover:bg-slate-50 transition-colors shadow-sm"
      title={t('language')}
    >
      {locale === 'en' ? 'العربية' : 'English'}
    </button>
  );
}
