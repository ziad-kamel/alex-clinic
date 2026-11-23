import { createHash, createHmac } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { AppointmentsService } from '../appointments.service';
import { PublicBookingGatewayGuard } from '../public-booking-gateway.guard';
import { addDays, clinicTodayDate, toDateOnly } from '../date-only';

const SPECIALIZATION_ID = '00000000-0000-0000-0000-000000000011';
const DOCTOR_ID = '00000000-0000-0000-0000-000000000012';

describe('Public appointment booking', () => {
  const appointmentDate = toDateOnly(addDays(clinicTodayDate(), 1));
  const scheduleWeekday = new Date(`${appointmentDate}T00:00:00.000Z`).getUTCDay();
  const doctor = {
    id: DOCTOR_ID,
    name: 'Dr. Test',
    nameAr: 'دكتور اختبار',
    active: true,
    specializationId: SPECIALIZATION_ID,
    specialization: { id: SPECIALIZATION_ID, name: 'General', nameAr: 'عام' },
    schedules: [{ weekday: scheduleWeekday, maxPatients: 3 }],
  };

  let service: AppointmentsService;
  let prisma: any;
  let tx: any;
  let operations: string[];

  beforeEach(() => {
    operations = [];
    tx = {
      doctor: { findUnique: jest.fn().mockResolvedValue(doctor) },
      $queryRaw: jest.fn(async () => { operations.push('identity-lock'); }),
      doctorDayCounter: {
        upsert: jest.fn(async () => { operations.push('counter-lock'); return { lastNumber: 4 }; }),
      },
      appointment: {
        count: jest.fn(async () => { operations.push('capacity-count'); return 1; }),
        create: jest.fn(async ({ data }) => {
          operations.push('appointment-create');
          return { id: 'appointment-id', appointmentDate: data.appointmentDate, queueNumber: data.queueNumber };
        }),
      },
      patient: {
        findMany: jest.fn(async () => { operations.push('patient-match'); return []; }),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn(async ({ data }) => ({ id: 'patient-id', ...data })),
      },
    };
    prisma = {
      $transaction: jest.fn(async (callback: (transaction: any) => unknown) => callback(tx)),
      doctor: { findUnique: jest.fn() },
      specialization: { findMany: jest.fn() },
      appointment: { groupBy: jest.fn() },
    };
    service = new AppointmentsService(prisma);
  });

  it('books online using the shared queue, capacity lock, and normalized patient identity', async () => {
    const existingPatient = { id: 'existing-patient', name: '  ALEX  PATIENT ', phone: '01012345678' };
    tx.patient.findMany.mockImplementation(async () => {
      operations.push('patient-match');
      return [existingPatient];
    });
    tx.patient.findUniqueOrThrow.mockResolvedValue(existingPatient);

    const result = await service.bookPublicAppointment({
      specializationId: SPECIALIZATION_ID,
      doctorId: DOCTOR_ID,
      appointmentDate,
      patientName: 'alex patient',
      patientPhone: '+20 (10) 1234-5678',
    } as any);

    expect(operations.indexOf('identity-lock')).toBeLessThan(operations.indexOf('counter-lock'));
    expect(operations.indexOf('counter-lock')).toBeLessThan(operations.indexOf('capacity-count'));
    expect(operations.indexOf('capacity-count')).toBeLessThan(operations.indexOf('patient-match'));
    expect(tx.patient.create).not.toHaveBeenCalled();
    expect(tx.appointment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ bookingSource: 'ONLINE', queueNumber: 4 }),
    }));
    expect(result).toEqual(expect.objectContaining({
      appointmentDate,
      queueNumber: 4,
      doctor: expect.objectContaining({ id: DOCTOR_ID }),
    }));
    expect(JSON.stringify(result)).not.toContain('01012345678');
  });

  it('rolls back a full date before it can create a patient or appointment', async () => {
    tx.appointment.count.mockResolvedValue(3);

    await expect(service.bookPublicAppointment({
      specializationId: SPECIALIZATION_ID,
      doctorId: DOCTOR_ID,
      appointmentDate,
      patientName: 'New Patient',
      patientPhone: '01012345678',
    } as any)).rejects.toBeInstanceOf(ConflictException);

    expect(tx.patient.findMany).not.toHaveBeenCalled();
    expect(tx.patient.create).not.toHaveBeenCalled();
    expect(tx.appointment.create).not.toHaveBeenCalled();
  });

  it('keeps family members who share a phone number as separate patients', async () => {
    tx.patient.findMany.mockResolvedValue([{ id: 'other-family-member', name: 'Different Patient' }]);
    tx.patient.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'new-patient',
      ...data,
    }));

    await service.bookPublicAppointment({
      specializationId: SPECIALIZATION_ID,
      doctorId: DOCTOR_ID,
      appointmentDate,
      patientName: 'New Patient',
      patientPhone: '+20 10 1234 5678',
    } as any);

    expect(tx.patient.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { phoneNormalized: '01012345678' },
    }));
    expect(tx.patient.create).toHaveBeenCalledWith({
      data: {
        name: 'New Patient',
        phone: '+20 10 1234 5678',
        phoneNormalized: '01012345678',
      },
    });
  });

  it('rejects past dates before opening a transaction', async () => {
    const yesterday = toDateOnly(addDays(clinicTodayDate(), -1));
    await expect(service.bookPublicAppointment({
      specializationId: SPECIALIZATION_ID,
      doctorId: DOCTOR_ID,
      appointmentDate: yesterday,
      patientName: 'New Patient',
      patientPhone: '01012345678',
    } as any)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('PublicBookingGatewayGuard', () => {
  const secret = 'phase-5-test-secret-that-is-at-least-32-bytes';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const method = 'POST';
  const path = '/api/public/appointments';
  const rawBody = Buffer.from('{"patientName":"Test Patient"}');

  beforeAll(() => {
    process.env.PUBLIC_BOOKING_GATEWAY_SECRET = secret;
  });

  afterAll(() => {
    delete process.env.PUBLIC_BOOKING_GATEWAY_SECRET;
  });

  it('accepts a current signature and rejects a request body changed in transit', () => {
    const bodyHash = createHash('sha256').update(rawBody).digest('hex');
    const signature = createHmac('sha256', secret)
      .update([timestamp, method, path, bodyHash].join('.'))
      .digest('hex');
    const request = {
      method,
      originalUrl: path,
      rawBody,
      header: (name: string) => ({
        'x-booking-timestamp': timestamp,
        'x-booking-signature': signature,
      })[name.toLowerCase()],
    };
    const context = { switchToHttp: () => ({ getRequest: () => request }) } as any;
    const guard = new PublicBookingGatewayGuard();

    expect(guard.canActivate(context)).toBe(true);
    request.rawBody = Buffer.from('{"patientName":"Different Patient"}');
    expect(() => guard.canActivate(context)).toThrow();
  });
});
