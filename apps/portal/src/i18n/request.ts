import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';

const locales = ['en', 'ar'] as const;
type Locale = (typeof locales)[number];

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get('NEXT_LOCALE')?.value;
  const configuredLocale = process.env.DEFAULT_LOCALE;
  const fallbackLocale = locales.includes(configuredLocale as Locale)
    ? (configuredLocale as Locale)
    : 'en';
  const locale = locales.includes(localeCookie as Locale)
    ? (localeCookie as Locale)
    : fallbackLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
