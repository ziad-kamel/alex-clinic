import { redirect } from 'next/navigation';
import { PortalHeader } from '@/components/PortalHeader';
import { prisma } from '@/lib/db';
import { getPortalSession } from '@/lib/session';

export default async function PortalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getPortalSession();
  if (!session) redirect('/');

  const account = await prisma.portalAccount.findUnique({
    where: { patientRef: session.patientRef },
    select: { patientName: true },
  });
  if (!account) redirect('/');

  return (
    <div className="min-h-screen">
      <PortalHeader patientName={account.patientName} />
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
