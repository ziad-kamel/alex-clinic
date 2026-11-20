import { createHmac, timingSafeEqual } from 'node:crypto';

const MAX_CLOCK_SKEW_SECONDS = 5 * 60;

export function verifySyncSignature(
  timestampHeader: string | null,
  signatureHeader: string | null,
  rawBody: string,
) {
  const secret = process.env.SYNC_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('SYNC_SECRET must contain at least 32 bytes');
  }
  if (
    !timestampHeader ||
    !/^\d{10}$/.test(timestampHeader) ||
    !signatureHeader
  ) {
    return false;
  }

  const timestamp = Number(timestampHeader);
  if (
    Math.abs(Math.floor(Date.now() / 1000) - timestamp) > MAX_CLOCK_SKEW_SECONDS
  ) {
    return false;
  }

  const expected = createHmac('sha256', secret)
    .update(`${timestampHeader}.${rawBody}`, 'utf8')
    .digest();
  const provided = Buffer.from(signatureHeader, 'hex');
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}
