import { z } from 'zod';
import { proxyBookingRequest } from '@/lib/booking-gateway';

const querySchema = z.object({ specializationId: z.string().uuid() });

export function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ specializationId: url.searchParams.get('specializationId') });
  if (!parsed.success) return Response.json({ code: 'INVALID_REQUEST' }, { status: 400 });

  const query = new URLSearchParams(parsed.data).toString();
  return proxyBookingRequest(request, `/public/booking/doctors?${query}`, 'GET');
}
