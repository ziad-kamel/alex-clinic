import { z } from 'zod';
import { proxyBookingRequest } from '@/lib/booking-gateway';

const bookingSchema = z.object({
  specializationId: z.string().uuid(),
  doctorId: z.string().uuid(),
  appointmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  patientName: z.string().trim().min(2).max(120),
  patientPhone: z.string().regex(/^\+?(?=(?:\D*\d){7})[0-9 ().-]{7,24}$/),
}).strict();

export async function POST(request: Request) {
  const rawBody = await request.text().catch(() => '');
  if (rawBody.length > 4096) {
    return Response.json({ code: 'INVALID_REQUEST' }, { status: 413 });
  }
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return Response.json({ code: 'INVALID_REQUEST' }, { status: 400 });
  }
  const parsed = bookingSchema.safeParse(body);
  if (!parsed.success) return Response.json({ code: 'INVALID_REQUEST' }, { status: 400 });

  return proxyBookingRequest(request, '/public/appointments', 'POST', parsed.data);
}
