import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { getClinicTimeZone, getPatientResults } from '@/lib/results';
import { getPortalSession } from '@/lib/session';

function formatDate(date: Date, locale: string) {
  return new Intl.DateTimeFormat(
    locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US',
    { dateStyle: 'long', timeZone: getClinicTimeZone() },
  ).format(date);
}

function flagLabel(
  flag: string | null,
  translate: (key: 'normal' | 'high' | 'low') => string,
) {
  if (flag === 'NORMAL') return translate('normal');
  if (flag === 'HIGH') return translate('high');
  if (flag === 'LOW') return translate('low');
  return '—';
}

export default async function ResultDetailPage({
  params,
}: {
  params: Promise<{ orderRef: string }>;
}) {
  const [{ orderRef }, session, locale, t, tCommon] = await Promise.all([
    params,
    getPortalSession(),
    getLocale(),
    getTranslations('results'),
    getTranslations('common'),
  ]);
  if (!session) redirect('/');

  const account = await prisma.portalAccount.findUnique({
    where: { patientRef: session.patientRef },
    select: { patientName: true, mustChangePassword: true },
  });
  if (!account) redirect('/');
  if (account.mustChangePassword) redirect('/change-password');

  const items = await getPatientResults(session.patientRef, {
    orderRef,
    orderBy: { testName: 'asc' },
  });
  if (items.length === 0) notFound();

  const completedAt = items.reduce(
    (latest, item) => (item.completedAt > latest ? item.completedAt : latest),
    items[0].completedAt,
  );

  return (
    <article className="print-report mx-auto max-w-4xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
      <div className="mb-8 border-b border-slate-200 pb-5 text-center">
        <p className="text-sm font-bold uppercase tracking-widest text-teal-700">
          {tCommon('clinicName')}
        </p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">{t('title')}</h1>
      </div>

      <dl className="mb-7 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-slate-500">{t('patientName')}</dt>
          <dd className="mt-1 font-semibold text-slate-900">
            {account.patientName}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">{t('completed')}</dt>
          <dd className="mt-1 font-semibold text-slate-900">
            {formatDate(completedAt, locale)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">{t('order')}</dt>
          <dd className="mt-1 font-mono font-semibold text-slate-900">
            {orderRef}
          </dd>
        </div>
      </dl>

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-start text-sm">
          <thead>
            <tr className="border-y border-slate-300 bg-slate-50">
              <th className="px-3 py-3 text-start">{t('test')}</th>
              <th className="px-3 py-3 text-start">{t('result')}</th>
              <th className="px-3 py-3 text-start">{t('unit')}</th>
              <th className="px-3 py-3 text-start">{t('referenceRange')}</th>
              <th className="px-3 py-3 text-start">{t('flag')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-slate-200">
                <td className="px-3 py-3 font-medium">
                  {locale === 'ar' && item.testNameAr
                    ? item.testNameAr
                    : item.testName}
                </td>
                <td className="px-3 py-3 font-mono font-semibold">
                  {item.value}
                </td>
                <td className="px-3 py-3">{item.unit ?? '—'}</td>
                <td className="px-3 py-3">{item.referenceRange ?? '—'}</td>
                <td className="px-3 py-3">{flagLabel(item.flag, t)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="no-print mt-7 flex flex-wrap gap-3">
        <Link
          href="/results"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          {tCommon('backToResults')}
        </Link>
        <a
          href={`/api/results/${orderRef}/pdf?locale=${locale}`}
          className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
        >
          {t('download')}
        </a>
      </div>
    </article>
  );
}
