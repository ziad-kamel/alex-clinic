import { NextResponse } from 'next/server';
import * as bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getPortalSession } from '@/lib/session';

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(8).max(256),
});

export async function POST(request: Request) {
  const session = await getPortalSession();
  if (!session) {
    return NextResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 });
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ code: 'INVALID_INPUT' }, { status: 400 });
  }
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) {
    return NextResponse.json({ code: 'INVALID_INPUT' }, { status: 400 });
  }

  const account = await prisma.portalAccount.findUnique({
    where: { patientRef: session.patientRef },
    select: { id: true, passwordHash: true },
  });
  if (
    !account ||
    !(await bcrypt.compare(
      parsed.data.currentPassword,
      account.passwordHash,
    )) ||
    parsed.data.currentPassword === parsed.data.newPassword
  ) {
    return NextResponse.json({ code: 'CHANGE_FAILED' }, { status: 400 });
  }

  await prisma.portalAccount.update({
    where: { id: account.id },
    data: {
      passwordHash: await bcrypt.hash(parsed.data.newPassword, 10),
      mustChangePassword: false,
      failedAttempts: 0,
      lockedUntil: null,
    },
  });
  return NextResponse.json({ success: true });
}
