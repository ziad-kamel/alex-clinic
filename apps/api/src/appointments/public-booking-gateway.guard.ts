import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Request } from 'express';

type SignedRequest = Request & { rawBody?: Buffer };

const SIGNATURE_MAX_AGE_SECONDS = 5 * 60;

@Injectable()
export class PublicBookingGatewayGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const secret = process.env.PUBLIC_BOOKING_GATEWAY_SECRET;
    const request = context.switchToHttp().getRequest<SignedRequest>();

    if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
      throw new UnauthorizedException();
    }

    const timestamp = request.header('x-booking-timestamp') || '';
    const signature = request.header('x-booking-signature') || '';
    const timestampSeconds = Number(timestamp);
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (
      !/^\d{10}$/.test(timestamp) ||
      !Number.isSafeInteger(timestampSeconds) ||
      Math.abs(nowSeconds - timestampSeconds) > SIGNATURE_MAX_AGE_SECONDS ||
      !/^[a-f0-9]{64}$/i.test(signature)
    ) {
      throw new UnauthorizedException();
    }

    const rawBody = request.rawBody || Buffer.alloc(0);
    const bodyHash = createHash('sha256').update(rawBody).digest('hex');
    const signedMessage = [
      timestamp,
      request.method.toUpperCase(),
      request.originalUrl,
      bodyHash,
    ].join('.');
    const expected = createHmac('sha256', secret).update(signedMessage).digest();
    const supplied = Buffer.from(signature, 'hex');

    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      throw new UnauthorizedException();
    }

    return true;
  }
}
