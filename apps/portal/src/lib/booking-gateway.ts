import { createHash, createHmac } from 'node:crypto';
import { consumePortalRateLimit } from './login-rate-limit';

const RATE_WINDOW_MS = 15 * 60 * 1000;

function clientIp(request: Request) {
  // Vercel overwrites X-Forwarded-For with the requester's public IP.
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return (forwarded || 'unknown').slice(0, 128);
}

export async function proxyBookingRequest(
  request: Request,
  apiPathAndQuery: string,
  method: 'GET' | 'POST',
  body?: Record<string, unknown>,
) {
  const maxAttempts = method === 'POST' ? 5 : 120;
  const scope = method === 'POST' ? 'public-booking-create' : 'public-booking-read';
  let allowed: boolean;
  try {
    allowed = await consumePortalRateLimit(
      clientIp(request),
      scope,
      maxAttempts,
      RATE_WINDOW_MS,
    );
  } catch {
    console.error('[booking-proxy] rate-limit store is unavailable');
    return Response.json({ code: 'BOOKING_UNAVAILABLE' }, { status: 503 });
  }
  if (!allowed) {
    return Response.json(
      { code: 'RATE_LIMITED' },
      {
        status: 429,
        headers: {
          'Retry-After': String(RATE_WINDOW_MS / 1000),
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  const gatewaySecret = process.env.PUBLIC_BOOKING_GATEWAY_SECRET;
  const apiBase = (process.env.PUBLIC_BOOKING_API_URL || 'http://localhost:3001/api').replace(/\/+$/, '');
  if (!gatewaySecret || Buffer.byteLength(gatewaySecret, 'utf8') < 32) {
    console.error('[booking-proxy] gateway secret is missing or too short');
    return Response.json({ code: 'BOOKING_UNAVAILABLE' }, { status: 503 });
  }

  try {
    const target = new URL(`${apiBase}${apiPathAndQuery}`);
    if (
      target.username ||
      target.password ||
      (process.env.NODE_ENV === 'production' && target.protocol !== 'https:')
    ) {
      console.error('[booking-proxy] API URL configuration is invalid');
      return Response.json({ code: 'BOOKING_UNAVAILABLE' }, { status: 503 });
    }

    const rawBody = body === undefined ? '' : JSON.stringify(body);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const bodyHash = createHash('sha256').update(rawBody).digest('hex');
    const signedMessage = [timestamp, method, target.pathname + target.search, bodyHash].join('.');
    const signature = createHmac('sha256', gatewaySecret).update(signedMessage).digest('hex');
    const upstream = await fetch(target, {
      method,
      headers: {
        'X-Booking-Timestamp': timestamp,
        'X-Booking-Signature': signature,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: rawBody }),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    const responseBody = await upstream.json().catch(() => ({ code: 'BOOKING_UNAVAILABLE' }));
    if (!upstream.ok) {
      const fallbackCode =
        upstream.status === 400 || upstream.status === 422
          ? 'INVALID_REQUEST'
          : upstream.status === 409
            ? 'BOOKING_CONFLICT'
            : upstream.status === 429
              ? 'RATE_LIMITED'
              : 'BOOKING_UNAVAILABLE';
      const code = typeof responseBody?.code === 'string' ? responseBody.code : fallbackCode;
      console.error(`[booking-proxy] API returned HTTP ${upstream.status} (${code})`);
      return Response.json(
        { code },
        { status: upstream.status, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return Response.json(responseBody, {
      status: upstream.status,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    console.error('[booking-proxy] API request failed before receiving a response');
    return Response.json(
      { code: 'BOOKING_UNAVAILABLE' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
