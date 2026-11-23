import { z } from 'zod';
import { proxyBookingRequest } from '@/lib/booking-gateway';

const querySchema = z.object({
  doctorId: z.string().uuid(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    doctorId: url.searchParams.get('doctorId'),
    from: url.searchParams.get('from'),
    to: url.searchParams.get('to'),
  });
  if (!parsed.success) return Response.json({ code: 'INVALID_REQUEST' }, { status: 400 });

  const query = new URLSearchParams(parsed.data).toString();
  return proxyBookingRequest(request, `/public/booking/availability?${query}`, 'GET');
}
