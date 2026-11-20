export function getClinicName(locale: string, translatedName: string) {
  const configuredName = process.env.NEXT_PUBLIC_CLINIC_NAME;
  return locale === 'en' && configuredName ? configuredName : translatedName;
}
