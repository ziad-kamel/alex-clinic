import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import {
  getClinicTimeZone,
  getPatientResults,
  groupResultsByOrder,
} from '@/lib/results';
import { getPortalSession } from '@/lib/session';

function formatDate(date: Date, locale: string) {
  return new Intl.DateTimeFormat(
    locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US',
    { dateStyle: 'medium', timeStyle: 'short', timeZone: getClinicTimeZone() },
  ).format(date);
}

export default async function ResultsPage() {
  const session = await getPortalSession();
  if (!session) redirect('/');

  const account = await prisma.portalAccount.findUnique({
    where: { patientRef: session.patientRef },
    select: { patientName: true, mustChangePassword: true },
  });
  if (!account) redirect('/');
  if (account.mustChangePassword) redirect('/change-password');

  const [results, locale, t] = await Promise.all([
    getPatientResults(session.patientRef, {
      orderBy: [{ completedAt: 'desc' }, { orderRef: 'desc' }],
    }),
    getLocale(),
    getTranslations('results'),
  ]);
  const orders = groupResultsByOrder(results);

  return (
    <section>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {t('welcome', { name: account.patientName })}
        </p>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <p className="font-semibold text-slate-700">{t('empty')}</p>
          <p className="mt-2 text-sm text-slate-500">{t('pendingSync')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <article
              key={order.orderRef}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-bold text-slate-900">
                    {t('order')} · {order.orderRef.slice(0, 8).toUpperCase()}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {t('completed')}: {formatDate(order.completedAt, locale)}
                  </p>
                </div>
                <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-800">
                  {t('tests')}: {order.items.length}
                </span>
              </div>
              <ul className="mt-4 divide-y divide-slate-100">
                {order.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                  >
                    <span className="font-medium text-slate-800">
                      {locale === 'ar' && item.testNameAr
                        ? item.testNameAr
                        : item.testName}
                    </span>
                    <span className="font-mono font-semibold text-slate-900">
                      {item.value} {item.unit ?? ''}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={`/results/${order.orderRef}`}
                  className="rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-teal-800"
                >
                  {t('view')}
                </Link>
                <a
                  href={`/api/results/${order.orderRef}/pdf?locale=${locale}`}
                  className="rounded-lg border border-teal-700 px-3.5 py-2 text-xs font-bold text-teal-800 hover:bg-teal-50"
                >
                  {t('download')}
                </a>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
