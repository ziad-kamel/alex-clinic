import { Test } from '@nestjs/testing';
import { LabService } from '../lab.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';
import { StaffRole, LabOrderStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

describe('LabService - Phase 2 Acceptance Criteria', () => {
  let service: LabService;
  let prisma: PrismaService;

  const testStaffId = '00000000-0000-0000-0000-000000000001';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [LabService, PrismaService],
    }).compile();

    service = moduleRef.get<LabService>(LabService);
    prisma = moduleRef.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  }, 15000);

  it('first lab order creates portal account with bcrypt hash; second reuses it without plain password', async () => {
    // 1. Create a test patient
    const patient = await prisma.patient.create({
      data: {
        name: 'Lab Test Patient Phase 2',
        phone: '01011112222',
      },
    });

    // 2. Fetch available test
    const tests = await prisma.labTest.findMany({
      where: { active: true },
      take: 2,
    });
    expect(tests.length).toBeGreaterThan(0);
    const testIds = tests.map((t) => t.id);

    try {
      // First Order: Must auto-create portal account
      const firstResult = await service.bookLabOrder(
        { patientId: patient.id, testIds },
        testStaffId,
      );

      expect(firstResult.portalAccount.isNewAccount).toBe(true);
      expect(firstResult.portalAccount.portalUserId).toBeDefined();
      expect(firstResult.portalAccount.portalUserId.length).toBe(8);
      expect(firstResult.portalAccount.plainPassword).toBeDefined();
      expect(firstResult.portalAccount.plainPassword!.length).toBe(10);

      // Verify DB contains ONLY the bcrypt hash, not the plain password
      const dbAccount = await prisma.portalAccountLocal.findUnique({
        where: { patientId: patient.id },
      });
      expect(dbAccount).toBeDefined();
      expect(dbAccount!.portalUserId).toBe(firstResult.portalAccount.portalUserId);
      expect(dbAccount!.passwordHash).not.toBe(firstResult.portalAccount.plainPassword);

      const isValidHash = await bcrypt.compare(
        firstResult.portalAccount.plainPassword!,
        dbAccount!.passwordHash,
      );
      expect(isValidHash).toBe(true);

      // Verify sync_outbox contains ACCOUNT_UPSERT
      const outbox = await prisma.syncOutbox.findFirst({
        where: {
          type: 'ACCOUNT_UPSERT',
          payload: {
            path: ['portalUserId'],
            equals: firstResult.portalAccount.portalUserId,
          },
        },
      });
      expect(outbox).toBeDefined();

      // Second Order for the SAME patient: Must reuse existing account and NOT return plain password
      const secondResult = await service.bookLabOrder(
        { patientId: patient.id, testIds: [testIds[0]] },
        testStaffId,
      );

      expect(secondResult.portalAccount.isNewAccount).toBe(false);
      expect(secondResult.portalAccount.portalUserId).toBe(
        firstResult.portalAccount.portalUserId,
      );
      expect(secondResult.portalAccount.plainPassword).toBeNull();
    } finally {
      // Cleanup
      await prisma.syncOutbox.deleteMany({
        where: {
          payload: {
            path: ['patientRef'],
            equals: patient.id,
          },
        },
      });
      await prisma.portalAccountLocal.deleteMany({
        where: { patientId: patient.id },
      });
      await prisma.labOrderItem.deleteMany({
        where: { order: { patientId: patient.id } },
      });
      await prisma.labOrder.deleteMany({
        where: { patientId: patient.id },
      });
      await prisma.patient.delete({
        where: { id: patient.id },
      });
    }
  }, 30000);

  it('cannot complete order with missing results', async () => {
    const patient = await prisma.patient.create({
      data: {
        name: 'Lab Incomplete Test Patient',
        phone: '01033334444',
      },
    });

    const tests = await prisma.labTest.findMany({
      where: { active: true },
      take: 2,
    });
    const testIds = tests.map((t) => t.id);

    try {
      const { order } = await service.bookLabOrder(
        { patientId: patient.id, testIds },
        testStaffId,
      );

      // Trying to complete order without entering all results must fail
      await expect(
        service.completeLabOrder(order.id, testStaffId),
      ).rejects.toThrow(BadRequestException);
    } finally {
      // Cleanup
      await prisma.portalAccountLocal.deleteMany({
        where: { patientId: patient.id },
      });
      await prisma.labOrderItem.deleteMany({
        where: { order: { patientId: patient.id } },
      });
      await prisma.labOrder.deleteMany({
        where: { patientId: patient.id },
      });
      await prisma.patient.delete({
        where: { id: patient.id },
      });
    }
  }, 30000);

  it('editing a completed result writes an audit entry and queues RESULT_UPSERT', async () => {
    const patient = await prisma.patient.create({
      data: {
        name: 'Lab Audit Test Patient',
        phone: '01055556666',
      },
    });

    const test = await prisma.labTest.findFirst({
      where: { active: true },
    });
    if (!test) return;

    try {
      const { order } = await service.bookLabOrder(
        { patientId: patient.id, testIds: [test.id] },
        testStaffId,
      );

      const itemId = order.items[0].id;

      // 1. Enter initial result
      await service.enterResult(
        order.id,
        itemId,
        { resultValue: '120', flag: 'NORMAL' },
        testStaffId,
        StaffRole.LAB,
      );

      // 2. Complete order
      const completed = await service.completeLabOrder(order.id, testStaffId);
      expect(completed.status).toBe(LabOrderStatus.COMPLETED);

      // 3. Edit result after completion (as LAB role)
      await service.enterResult(
        order.id,
        itemId,
        { resultValue: '145', flag: 'HIGH' },
        testStaffId,
        StaffRole.LAB,
      );

      // 4. Verify audit_log entry was created
      const audit = await prisma.auditLog.findFirst({
        where: {
          action: 'LAB_RESULT_EDITED_AFTER_COMPLETION',
          targetId: itemId,
        },
      });
      expect(audit).toBeDefined();
      expect((audit!.details as any).oldValue).toBe('120');
      expect((audit!.details as any).newValue).toBe('145');

      // 5. Verify RESULT_UPSERT was queued in sync_outbox
      const syncResult = await prisma.syncOutbox.findFirst({
        where: {
          type: 'RESULT_UPSERT',
          status: 'PENDING',
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(syncResult).toBeDefined();
    } finally {
      // Cleanup
      await prisma.auditLog.deleteMany({
        where: { action: 'LAB_RESULT_EDITED_AFTER_COMPLETION' },
      });
      await prisma.syncOutbox.deleteMany({
        where: {
          payload: {
            path: ['patientRef'],
            equals: patient.id,
          },
        },
      });
      await prisma.portalAccountLocal.deleteMany({
        where: { patientId: patient.id },
      });
      await prisma.labOrderItem.deleteMany({
        where: { order: { patientId: patient.id } },
      });
      await prisma.labOrder.deleteMany({
        where: { patientId: patient.id },
      });
      await prisma.patient.delete({
        where: { id: patient.id },
      });
    }
  }, 40000);
});
