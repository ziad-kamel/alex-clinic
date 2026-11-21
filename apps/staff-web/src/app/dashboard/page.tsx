import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get('staff_token')?.value;

  if (!token) return null;

  try {
    const res = await fetch('http://localhost:3001/api/auth/me', {
      headers: {
        Cookie: `staff_token=${token}`,
      },
      cache: 'no-store',
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.user;
  } catch {
    return null;
  }
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const t = await getTranslations('nav');
  const tFrontDesk = await getTranslations('frontDesk');

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8">
        <h2 className="text-2xl font-bold text-slate-900 mb-2">
          {t('dashboard')}
        </h2>
        <p className="text-slate-600 mb-6">
          Welcome back, <strong>{user?.name}</strong>. Access your operational modules below:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Front Desk Card */}
          <Link
            href="/dashboard/front-desk"
            className="group block p-6 border-2 border-slate-200 hover:border-teal-500 rounded-lg bg-slate-50 hover:bg-teal-50 transition-all"
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-lg text-slate-900 group-hover:text-teal-700">
                {t('frontDesk')}
              </h3>
              <span className="text-xs px-2 py-0.5 bg-teal-600 text-white font-bold rounded">
                Active (Phase 1)
              </span>
            </div>
            <p className="text-sm text-slate-600">
              {tFrontDesk('title')}: Patient registration, appointment booking, and 80mm receipts.
            </p>
          </Link>

          {/* Laboratory Card */}
          <Link
            href="/dashboard/lab"
            className="group block p-6 border-2 border-slate-200 hover:border-teal-500 rounded-lg bg-slate-50 hover:bg-teal-50 transition-all"
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-lg text-slate-900 group-hover:text-teal-700">
                {t('laboratory')}
              </h3>
              <span className="text-xs px-2 py-0.5 bg-teal-600 text-white font-bold rounded">
                Active (Phase 2)
              </span>
            </div>
            <p className="text-sm text-slate-600">
              Lab orders, test results entry, verification, and diagnostic reports.
            </p>
          </Link>

          {/* Doctor Queue Card */}
          <Link
            href="/dashboard/doctor"
            className="group block p-6 border-2 border-slate-200 hover:border-teal-500 rounded-lg bg-slate-50 hover:bg-teal-50 transition-all"
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-lg text-slate-900 group-hover:text-teal-700">
                {t('doctorQueue')}
              </h3>
              <span className="text-xs px-2 py-0.5 bg-teal-600 text-white font-bold rounded">
                Active (Phase 4)
              </span>
            </div>
            <p className="text-sm text-slate-600">
              Daily queue attendance, patient consultation marking, and clinic queue tracking.
            </p>
          </Link>

          {/* Operational Reports Card (Admin) */}
          {user?.role === 'ADMIN' && (
            <Link
              href="/dashboard/reports"
              className="group block p-6 border-2 border-slate-200 hover:border-teal-500 rounded-lg bg-slate-50 hover:bg-teal-50 transition-all"
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-lg text-slate-900 group-hover:text-teal-700">
                  {t('reports')}
                </h3>
                <span className="text-xs px-2 py-0.5 bg-teal-600 text-white font-bold rounded">
                  Active (Phase 4)
                </span>
              </div>
              <p className="text-sm text-slate-600">
                Clinic metrics: appointments per doctor per day and daily diagnostic test volume.
              </p>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
