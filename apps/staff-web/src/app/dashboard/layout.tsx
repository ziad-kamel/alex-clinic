import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { LogoutButton } from './LogoutButton';
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

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  const t = await getTranslations('nav');
  const tAuth = await getTranslations('auth');
  const tCommon = await getTranslations('common');

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Navigation */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-6 rtl:space-x-reverse">
          <Link href="/dashboard" className="text-xl font-bold text-teal-700">
            {tCommon('clinicName')}
          </Link>

          <nav className="flex space-x-2 rtl:space-x-reverse text-sm font-medium">
            {(user.role === 'ADMIN' || user.role === 'FRONT_DESK' || user.role === 'LAB') && (
              <Link
                href="/dashboard/front-desk"
                className="px-3 py-1.5 rounded-md text-slate-700 hover:bg-slate-100 hover:text-teal-700"
              >
                {t('frontDesk')}
              </Link>
            )}

            {(user.role === 'ADMIN' || user.role === 'DOCTOR') && (
              <span className="px-3 py-1.5 rounded-md text-slate-400 cursor-not-allowed">
                {t('doctorQueue')} (Phase 4)
              </span>
            )}

            {(user.role === 'ADMIN' || user.role === 'LAB' || user.role === 'FRONT_DESK') && (
              <Link
                href="/dashboard/lab"
                className="px-3 py-1.5 rounded-md text-slate-700 hover:bg-slate-100 hover:text-teal-700"
              >
                {t('laboratory')}
              </Link>
            )}
          </nav>
        </div>

        <div className="flex items-center space-x-4 rtl:space-x-reverse">
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-teal-100 text-teal-800 font-bold">
            {user.role}
          </span>
          <span className="text-xs text-slate-600 hidden sm:inline">
            {tAuth('loggedInAs')}: <strong>{user.name}</strong>
          </span>
          <LanguageSwitcher />
          <LogoutButton />
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6">{children}</main>
    </div>
  );
}
