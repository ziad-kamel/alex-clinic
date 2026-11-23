import { proxyBookingRequest } from '@/lib/booking-gateway';

export function GET(request: Request) {
  return proxyBookingRequest(request, '/public/booking/specializations', 'GET');
}
