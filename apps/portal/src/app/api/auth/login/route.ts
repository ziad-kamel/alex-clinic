import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import * as bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { consumeLoginRateLimit } from '@/lib/login-rate-limit';
import { createPortalSession, setPortalSession } from '@/lib/session';

const loginSchema = z.object({
  userId: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(256),
});

let dummyHashPromise: Promise<string> | undefined;

async function comparePassword(password: string, passwordHash?: string) {
  if (passwordHash) return bcrypt.compare(password, passwordHash);
  dummyHashPromise ??= bcrypt.hash(randomBytes(32).toString('hex'), 10);
  await bcrypt.compare(password, await dummyHashPromise);
  return false;
}

export async function POST(request: Request) {
  const ipAddress =
    request.headers.get('x-real-ip') ??
    request.headers.get('x-forwarded-for')?.split(',').pop()?.trim() ??
    'unknown';
  if (!(await consumeLoginRateLimit(ipAddress))) {
    return NextResponse.json({ code: 'RATE_LIMITED' }, { status: 429 });
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ code: 'INVALID_CREDENTIALS' }, { status: 401 });
  }
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return NextResponse.json({ code: 'INVALID_CREDENTIALS' }, { status: 401 });
  }

  const account = await prisma.portalAccount.findUnique({
    where: { userId: parsed.data.userId.toUpperCase() },
  });
  if (!account) {
    await comparePassword(parsed.data.password);
    return NextResponse.json({ code: 'INVALID_CREDENTIALS' }, { status: 401 });
  }

  const now = new Date();
  if (account.lockedUntil && account.lockedUntil > now) {
    await comparePassword(parsed.data.password, account.passwordHash);
    return NextResponse.json({ code: 'INVALID_CREDENTIALS' }, { status: 401 });
  }

  const passwordMatches = await comparePassword(
    parsed.data.password,
    account.passwordHash,
  );
  if (!passwordMatches) {
    const failedAccount = await prisma.portalAccount.update({
      where: { id: account.id },
      data: { failedAttempts: { increment: 1 } },
      select: { failedAttempts: true },
    });
    if (failedAccount.failedAttempts >= 5) {
      await prisma.portalAccount.update({
        where: { id: account.id },
        data: {
          failedAttempts: 5,
          lockedUntil: new Date(now.getTime() + 15 * 60 * 1000),
        },
      });
    }
    return NextResponse.json({ code: 'INVALID_CREDENTIALS' }, { status: 401 });
  }

  await prisma.portalAccount.update({
    where: { id: account.id },
    data: { failedAttempts: 0, lockedUntil: null },
  });
  const token = await createPortalSession(account.patientRef);
  await setPortalSession(token);
  return NextResponse.json({ mustChangePassword: account.mustChangePassword });
}
