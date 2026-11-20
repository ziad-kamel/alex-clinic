import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';

const COOKIE_NAME = 'portal_session';
const sessionPayloadSchema = z.object({
  patientRef: z.string().uuid(),
});

function getSessionKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 bytes');
  }
  return new TextEncoder().encode(secret);
}

export async function createPortalSession(patientRef: string) {
  return new SignJWT({ patientRef })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(getSessionKey());
}

export async function setPortalSession(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 8 * 60 * 60,
    path: '/',
  });
}

export async function clearPortalSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getPortalSession() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSessionKey(), {
      algorithms: ['HS256'],
    });
    const parsed = sessionPayloadSchema.safeParse(payload);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
