import { Test } from '@nestjs/testing';
import { AppointmentsService } from '../appointments.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';

describe('AppointmentsService - Concurrency & Business Rules', () => {
  let service: AppointmentsService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [AppointmentsService, PrismaService],
    }).compile();

    service = moduleRef.get<AppointmentsService>(AppointmentsService);
    prisma = moduleRef.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  }, 15000);

  it('rejects booking on a non-working day', async () => {
    // Dr. Ahmed Mostafa has schedules for Sunday-Thursday (weekday 0-4).
    // Saturday = 6 (e.g. 2026-11-21)
    const doctor = await prisma.doctor.findFirst({ where: { active: true } });
    const patient = await prisma.patient.findFirst();

    if (doctor && patient) {
      await expect(
        service.bookAppointment(
          {
            patientId: patient.id,
            doctorId: doctor.id,
            appointmentDate: '2026-11-21', // Saturday (weekday 6)
          },
          '00000000-0000-0000-0000-000000000001',
        ),
      ).rejects.toThrow(BadRequestException);
    }
  });

  it('generates sequential unique queue numbers under concurrency', async () => {
    const doctor = await prisma.doctor.findFirst({ where: { active: true } });
    if (!doctor) return;

    // Use a date that is a Sunday (weekday 0), e.g. 2026-11-22
    const testDate = '2026-11-22';
    const testStaffId = '00000000-0000-0000-0000-000000000001';

    // Create 10 test patients
    const patients = await Promise.all(
      Array.from({ length: 10 }).map((_, i) =>
        prisma.patient.create({
          data: {
            name: `Concurrent Test Patient ${i + 1}`,
            phone: `010999990${i}`,
          },
        }),
      ),
    );

    // Concurrently book 10 appointments
    const bookings = await Promise.all(
      patients.map((p) =>
        service.bookAppointment(
          {
            patientId: p.id,
            doctorId: doctor.id,
            appointmentDate: testDate,
          },
          testStaffId,
        ),
      ),
    );

    const queueNumbers = bookings.map((b) => b.queueNumber);
    const uniqueNumbers = new Set(queueNumbers);

    // Verify all queue numbers are distinct
    expect(uniqueNumbers.size).toBe(10);

    // Verify sequential sequence
    const sorted = [...queueNumbers].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i]).toBe(sorted[i - 1] + 1);
    }

    // Clean up test appointments and patients
    await prisma.appointment.deleteMany({
      where: { patientId: { in: patients.map((p) => p.id) } },
    });
    await prisma.doctorDayCounter.deleteMany({
      where: {
        doctorId: doctor.id,
        date: new Date(Date.UTC(2026, 10, 22)),
      },
    });
    await prisma.patient.deleteMany({
      where: { id: { in: patients.map((p) => p.id) } },
    });
  }, 30000);
});
