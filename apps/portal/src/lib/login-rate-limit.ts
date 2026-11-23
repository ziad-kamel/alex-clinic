import { createHmac } from 'node:crypto';
import type { Prisma } from '@prisma/client-portal';
import { prisma } from './db';

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS_PER_IP = 20;

export async function consumePortalRateLimit(
  ipAddress: string,
  scope: string,
  maxAttempts: number,
  windowMs: number,
) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 bytes');
  }
  const ipHash = createHmac('sha256', secret)
    .update(`${scope}\u0000${ipAddress}`)
    .digest('hex');
  const now = new Date();

  await prisma.portalLoginLimit.upsert({
    where: { ipHash },
    create: { ipHash, attempts: 0, windowStartedAt: now },
    update: { ipHash },
  });

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "ip_hash"
      FROM "portal"."portal_login_limits"
      WHERE "ip_hash" = ${ipHash}
      FOR UPDATE
    `;

    const bucket = await tx.portalLoginLimit.findUniqueOrThrow({
      where: { ipHash },
    });

    if (bucket.blockedUntil && bucket.blockedUntil > now) {
      return false;
    }

    if (bucket.windowStartedAt.getTime() <= now.getTime() - windowMs) {
      await tx.portalLoginLimit.update({
        where: { ipHash },
        data: {
          attempts: 1,
          windowStartedAt: now,
          blockedUntil: null,
        },
      });
      await pruneOldBuckets(tx, now);
      return true;
    }

    const attempts = bucket.attempts + 1;
    await tx.portalLoginLimit.update({
      where: { ipHash },
      data: {
        attempts,
        blockedUntil:
          attempts > maxAttempts
            ? new Date(now.getTime() + windowMs)
            : null,
      },
    });
    await pruneOldBuckets(tx, now);

    return attempts <= maxAttempts;
  });
}

export function consumeLoginRateLimit(ipAddress: string) {
  return consumePortalRateLimit(ipAddress, 'portal-login', LOGIN_MAX_ATTEMPTS_PER_IP, LOGIN_WINDOW_MS);
}

async function pruneOldBuckets(tx: Prisma.TransactionClient, now: Date) {
  await tx.$executeRaw`
    DELETE FROM "portal"."portal_login_limits"
    WHERE "ip_hash" IN (
      SELECT "ip_hash"
      FROM "portal"."portal_login_limits"
      WHERE "window_started_at" < ${new Date(now.getTime() - 24 * 60 * 60 * 1000)}
      ORDER BY "window_started_at" ASC
      LIMIT 50
    )
  `;
}
