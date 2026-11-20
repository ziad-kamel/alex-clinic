import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ChangePasswordForm } from '@/components/ChangePasswordForm';
import { prisma } from '@/lib/db';
import { getPortalSession } from '@/lib/session';

export default async function ChangePasswordPage() {
  const session = await getPortalSession();
  if (!session) redirect('/');
  const account = await prisma.portalAccount.findUnique({
    where: { patientRef: session.patientRef },
    select: { mustChangePassword: true },
  });
  if (!account) redirect('/');

  const t = await getTranslations('password');
  return (
    <section className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
      {account.mustChangePassword && (
        <p className="mt-2 text-sm text-amber-800">{t('required')}</p>
      )}
      <div className="mt-6">
        <ChangePasswordForm />
      </div>
    </section>
  );
}
