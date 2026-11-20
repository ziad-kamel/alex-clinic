import { NextResponse } from 'next/server';
import { SyncAccountPayloadSchema } from '@clinic/shared';
import { prisma } from '@/lib/db';
import { readSignedBody } from '@/lib/sync-http';

export async function POST(request: Request) {
  const signedBody = await readSignedBody(request);
  if (!signedBody.success) return signedBody.response;

  const parsed = SyncAccountPayloadSchema.safeParse(signedBody.value);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid account sync payload' },
      { status: 400 },
    );
  }

  const account = parsed.data;
  await prisma.portalAccount.upsert({
    where: { patientRef: account.patientRef },
    create: {
      patientRef: account.patientRef,
      userId: account.portalUserId,
      passwordHash: account.passwordHash,
      patientName: account.patientName,
      mustChangePassword: account.mustChangePassword,
    },
    update: {
      userId: account.portalUserId,
      passwordHash: account.passwordHash,
      patientName: account.patientName,
      mustChangePassword: account.mustChangePassword,
    },
  });

  return NextResponse.json({ success: true });
}
