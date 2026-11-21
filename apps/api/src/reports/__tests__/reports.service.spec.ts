import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { ReportsService } from '../reports.service';

describe('ReportsService', () => {
  let service: ReportsService;
  let prisma: {
    appointment: { findMany: jest.Mock };
    labOrder: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      appointment: { findMany: jest.fn() },
      labOrder: { findMany: jest.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get<ReportsService>(ReportsService);
  });

  it('aggregates appointments per doctor per day correctly', async () => {
    const mockAppointments = [
      {
        id: 'app-1',
        appointmentDate: new Date('2026-11-20T00:00:00.000Z'),
        doctorId: 'doc-1',
        status: 'SEEN',
        doctor: {
          name: 'Dr. Ahmed Mostafa',
          nameAr: 'د. أحمد مصطفى',
          specialization: { name: 'Internal Medicine', nameAr: 'باطنة' },
        },
      },
      {
        id: 'app-2',
        appointmentDate: new Date('2026-11-20T00:00:00.000Z'),
        doctorId: 'doc-1',
        status: 'BOOKED',
        doctor: {
          name: 'Dr. Ahmed Mostafa',
          nameAr: 'د. أحمد مصطفى',
          specialization: { name: 'Internal Medicine', nameAr: 'باطنة' },
        },
      },
      {
        id: 'app-3',
        appointmentDate: new Date('2026-11-20T00:00:00.000Z'),
        doctorId: 'doc-2',
        status: 'CANCELLED',
        doctor: {
          name: 'Dr. Sarah Samy',
          nameAr: null,
          specialization: { name: 'Pediatrics', nameAr: null },
        },
      },
    ];

    prisma.appointment.findMany.mockResolvedValue(mockAppointments);

    const result = await service.getAppointmentsPerDoctorPerDay('2026-11-20', '2026-11-20');

    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('2026-11-20');
    expect(result[0].doctors).toHaveLength(2);

    const doc1 = result[0].doctors.find((d: any) => d.doctorId === 'doc-1');
    expect(doc1).toBeDefined();
    expect(doc1?.total).toBe(2);
    expect(doc1?.seen).toBe(1);
    expect(doc1?.booked).toBe(1);
    expect(doc1?.cancelled).toBe(0);

    const doc2 = result[0].doctors.find((d: any) => d.doctorId === 'doc-2');
    expect(doc2).toBeDefined();
    expect(doc2?.total).toBe(1);
    expect(doc2?.cancelled).toBe(1);
  });

  it('aggregates lab orders per day correctly', async () => {
    const mockOrders = [
      {
        id: 'order-1',
        createdAt: new Date('2026-11-20T10:00:00.000Z'),
        status: 'COMPLETED',
        items: [{ id: 'item-1' }, { id: 'item-2' }],
      },
      {
        id: 'order-2',
        createdAt: new Date('2026-11-20T14:30:00.000Z'),
        status: 'IN_PROGRESS',
        items: [{ id: 'item-3' }],
      },
      {
        id: 'order-3',
        createdAt: new Date('2026-11-21T09:15:00.000Z'),
        status: 'BOOKED',
        items: [{ id: 'item-4' }, { id: 'item-5' }, { id: 'item-6' }],
      },
    ];

    prisma.labOrder.findMany.mockResolvedValue(mockOrders);

    const result = await service.getLabOrdersPerDay('2026-11-20', '2026-11-21');

    expect(result).toHaveLength(2);

    const day1 = result.find((r: any) => r.date === '2026-11-20');
    expect(day1).toBeDefined();
    expect(day1?.totalOrders).toBe(2);
    expect(day1?.completed).toBe(1);
    expect(day1?.inProgress).toBe(1);
    expect(day1?.totalTests).toBe(3);

    const day2 = result.find((r: any) => r.date === '2026-11-21');
    expect(day2).toBeDefined();
    expect(day2?.totalOrders).toBe(1);
    expect(day2?.booked).toBe(1);
    expect(day2?.totalTests).toBe(3);
  });
});
