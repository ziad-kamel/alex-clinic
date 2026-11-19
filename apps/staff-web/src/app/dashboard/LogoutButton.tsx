'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

export function LogoutButton() {
  const router = useRouter();
  const t = useTranslations('common');

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch {
      router.push('/login');
    }
  };

  return (
    <button
      onClick={handleLogout}
      className="px-3 py-1.5 text-sm font-medium border border-red-300 text-red-700 rounded-md bg-white hover:bg-red-50 transition-colors shadow-sm"
    >
      {t('logout')}
    </button>
  );
}
