import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateLabTestDto,
  UpdateLabTestDto,
  BookLabOrderDto,
  EnterResultDto,
} from './dto/lab.dto';
import {
  LabOrderStatus,
  StaffRole,
  SyncType,
  SyncStatus,
  TestResultFlag,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import {
  generatePortalUserId,
  generatePortalPassword,
} from './lab-crypto.util';

@Injectable()
export class LabService {
  constructor(private readonly prisma: PrismaService) {}

  // ===================== LAB TEST CATALOG =====================

  async getTests(activeOnly = true) {
    return this.prisma.labTest.findMany({
      where: activeOnly ? { active: true } : {},
      orderBy: { code: 'asc' },
    });
  }

  async getTestById(id: string) {
    const test = await this.prisma.labTest.findUnique({
      where: { id },
    });
    if (!test) {
      throw new NotFoundException(`Lab test with ID ${id} not found`);
    }
    return test;
  }

  async createTest(dto: CreateLabTestDto) {
    const existing = await this.prisma.labTest.findUnique({
      where: { code: dto.code.trim().toUpperCase() },
    });
    if (existing) {
      throw new BadRequestException(
        `Lab test with code ${dto.code} already exists`,
      );
    }

    return this.prisma.labTest.create({
      data: {
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        nameAr: dto.nameAr?.trim() || null,
        unit: dto.unit?.trim() || null,
        referenceRange: dto.referenceRange?.trim() || null,
        active: true,
      },
    });
  }

  async updateTest(id: string, dto: UpdateLabTestDto) {
    await this.getTestById(id);

    return this.prisma.labTest.update({
      where: { id },
      data: {
        ...(dto.code ? { code: dto.code.trim().toUpperCase() } : {}),
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr?.trim() || null } : {}),
        ...(dto.unit !== undefined ? { unit: dto.unit?.trim() || null } : {}),
        ...(dto.referenceRange !== undefined
          ? { referenceRange: dto.referenceRange?.trim() || null }
          : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
  }

  async deleteTest(id: string) {
    await this.getTestById(id);
    // Soft delete to preserve historical integrity of lab results
    return this.prisma.labTest.update({
      where: { id },
      data: { active: false },
    });
  }

  // ===================== AUDIT LOGS =====================

  async getAuditLogs(action?: string, limit = 50) {
    return this.prisma.auditLog.findMany({
      where: action ? { action } : {},
      orderBy: { createdAt: 'desc' },
      take: Math.min(100, Math.max(1, Number(limit) || 50)),
    });
  }

  // ===================== LAB ORDERS & CREDENTIALS =====================

  async bookLabOrder(dto: BookLabOrderDto, staffUserId: string) {
    const { patientId, testIds } = dto;

    // 1. Verify Patient
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
    });
    if (!patient) {
      throw new NotFoundException(`Patient with ID ${patientId} not found`);
    }

    // 2. Verify all testIds exist and are active
    const validTests = await this.prisma.labTest.findMany({
      where: {
        id: { in: testIds },
        active: true,
      },
    });

    if (validTests.length !== testIds.length) {
      throw new BadRequestException('One or more selected lab tests are invalid or inactive');
    }

    // 3. Interactive Transaction: Book order + auto-create portal account if needed
    return this.prisma.$transaction(
      async (tx) => {
        // Create Lab Order and items
        const order = await tx.labOrder.create({
          data: {
            patientId,
            createdBy: staffUserId,
            status: LabOrderStatus.BOOKED,
            items: {
              create: testIds.map((testId) => ({ testId })),
            },
          },
          include: {
            patient: true,
            items: {
              include: { test: true },
            },
          },
        });

        // Check if patient already has a portal account
        let portalAccount = await tx.portalAccountLocal.findUnique({
          where: { patientId },
        });

        let plainPassword: string | null = null;
        let isNewAccount = false;

        if (!portalAccount) {
          isNewAccount = true;
          // Generate unique 8-character portal user ID
          let portalUserId = generatePortalUserId(8);
          let collision = await tx.portalAccountLocal.findUnique({
            where: { portalUserId },
          });
          while (collision) {
            portalUserId = generatePortalUserId(8);
            collision = await tx.portalAccountLocal.findUnique({
              where: { portalUserId },
            });
          }

          // Generate 10-character password
          plainPassword = generatePortalPassword(10);
          const passwordHash = await bcrypt.hash(plainPassword, 10);

          portalAccount = await tx.portalAccountLocal.create({
            data: {
              patientId,
              portalUserId,
              passwordHash,
            },
          });

          const forcePasswordChange =
            process.env.FORCE_PASSWORD_CHANGE === 'true';

          // Queue ACCOUNT_UPSERT in sync_outbox
          await tx.syncOutbox.create({
            data: {
              type: SyncType.ACCOUNT_UPSERT,
              status: SyncStatus.PENDING,
              payload: {
                patientRef: patient.id,
                portalUserId,
                passwordHash,
                patientName: patient.name,
                mustChangePassword: forcePasswordChange,
              },
            },
          });
        }

        return {
          order,
          portalAccount: {
            portalUserId: portalAccount.portalUserId,
            // Plain password returned ONCE in response for printing only
            plainPassword,
            isNewAccount,
          },
        };
      },
      {
        maxWait: 15000,
        timeout: 20000,
      },
    );
  }

  async getLabOrders(status?: LabOrderStatus, date?: string, patientId?: string) {
    let dateFilter: { gte: Date; lte: Date } | undefined;
    if (date) {
      const [y, m, d] = date.split('-').map(Number);
      const startOfDay = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
      const endOfDay = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
      dateFilter = { gte: startOfDay, lte: endOfDay };
    }

    return this.prisma.labOrder.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(dateFilter ? { createdAt: dateFilter } : {}),
        ...(patientId ? { patientId } : {}),
      },
      include: {
        patient: {
          include: { portalAccountLocal: true },
        },
        items: {
          include: { test: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getLabOrderById(id: string) {
    const order = await this.prisma.labOrder.findUnique({
      where: { id },
      include: {
        patient: {
          include: { portalAccountLocal: true },
        },
        items: {
          include: { test: true },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Lab order with ID ${id} not found`);
    }

    return order;
  }

  async getLabOrderReceipt(id: string) {
    const order = await this.prisma.labOrder.findUnique({
      where: { id },
      include: {
        patient: {
          include: { portalAccountLocal: true },
        },
        items: {
          include: { test: true },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Lab order with ID ${id} not found`);
    }

    const portalUrl =
      process.env.PORTAL_BASE_URL || 'https://portal.alexclinic.com';

    return {
      clinicName: process.env.CLINIC_NAME || 'Alex Clinic',
      receiptNumber: `LAB-${order.id.substring(0, 8).toUpperCase()}`,
      orderId: order.id,
      patientName: order.patient.name,
      patientPhone: order.patient.phone,
      orderDate: order.createdAt,
      tests: order.items.map((i) => ({
        code: i.test.code,
        name: i.test.name,
        nameAr: i.test.nameAr,
        unit: i.test.unit,
        referenceRange: i.test.referenceRange,
      })),
      portalUrl,
      portalUserId: order.patient.portalAccountLocal?.portalUserId || null,
      hasExistingAccount: !!order.patient.portalAccountLocal,
    };
  }

  // ===================== RESULTS ENTRY & COMPLETION =====================

  async enterResult(
    orderId: string,
    itemId: string,
    dto: EnterResultDto,
    staffUserId: string,
    staffUserRole: StaffRole,
  ) {
    const order = await this.prisma.labOrder.findUnique({
      where: { id: orderId },
      include: {
        items: { include: { test: true } },
      },
    });

    if (!order) {
      throw new NotFoundException(`Lab order with ID ${orderId} not found`);
    }

    const item = order.items.find((i) => i.id === itemId);
    if (!item) {
      throw new NotFoundException(
        `Lab order item with ID ${itemId} not found in this order`,
      );
    }

    const isCompleted = order.status === LabOrderStatus.COMPLETED;

    return this.prisma.$transaction(
      async (tx) => {
        // If order is completed, editing is allowed only for LAB and ADMIN,
        // and must write an audit log and queue a new RESULT_UPSERT.
        if (isCompleted) {
          if (
            staffUserRole !== StaffRole.LAB &&
            staffUserRole !== StaffRole.ADMIN
          ) {
            throw new ForbiddenException(
              'Only LAB staff or ADMIN can edit completed results',
            );
          }

          // Write audit log entry
          await tx.auditLog.create({
            data: {
              userId: staffUserId,
              action: 'LAB_RESULT_EDITED_AFTER_COMPLETION',
              targetType: 'lab_order_items',
              targetId: itemId,
              details: {
                orderId,
                testId: item.testId,
                oldValue: item.resultValue,
                newValue: dto.resultValue,
                oldFlag: item.flag,
                newFlag: dto.flag || null,
              },
            },
          });

          // Queue new RESULT_UPSERT in sync_outbox
          await tx.syncOutbox.create({
            data: {
              type: SyncType.RESULT_UPSERT,
              status: SyncStatus.PENDING,
              payload: {
                items: [
                  {
                    patientRef: order.patientId,
                    orderRef: order.id,
                    testRef: item.testId,
                    testName: item.test.name,
                    testNameAr: item.test.nameAr,
                    value: dto.resultValue,
                    unit: item.test.unit,
                    referenceRange: item.test.referenceRange,
                    flag: dto.flag || null,
                    completedAt: order.completedAt
                      ? order.completedAt.toISOString()
                      : new Date().toISOString(),
                  },
                ],
              },
            },
          });
        }

        // Status auto-transitions: BOOKED -> IN_PROGRESS on first result entered
        if (order.status === LabOrderStatus.BOOKED) {
          await tx.labOrder.update({
            where: { id: orderId },
            data: { status: LabOrderStatus.IN_PROGRESS },
          });
        }

        // Update item result
        return tx.labOrderItem.update({
          where: { id: itemId },
          data: {
            resultValue: dto.resultValue,
            flag: dto.flag ? (dto.flag as TestResultFlag) : null,
            enteredBy: staffUserId,
            enteredAt: new Date(),
          },
          include: { test: true },
        });
      },
      {
        maxWait: 15000,
        timeout: 20000,
      },
    );
  }

  async completeLabOrder(orderId: string, staffUserId: string) {
    const order = await this.prisma.labOrder.findUnique({
      where: { id: orderId },
      include: {
        items: { include: { test: true } },
      },
    });

    if (!order) {
      throw new NotFoundException(`Lab order with ID ${orderId} not found`);
    }

    // Validation: complete is allowed only when every item has a result value
    const missingResults = order.items.filter(
      (item) => !item.resultValue || !item.resultValue.trim(),
    );

    if (missingResults.length > 0) {
      const missingNames = missingResults.map((i) => i.test.name).join(', ');
      throw new BadRequestException(
        `Cannot complete order: results are missing for [${missingNames}]`,
      );
    }

    const completedAt = new Date();

    return this.prisma.$transaction(
      async (tx) => {
        // Transition order status to COMPLETED
        const completedOrder = await tx.labOrder.update({
          where: { id: orderId },
          data: {
            status: LabOrderStatus.COMPLETED,
            completedAt,
          },
          include: {
            patient: true,
            items: { include: { test: true } },
          },
        });

        // Queue RESULT_UPSERT in sync_outbox
        await tx.syncOutbox.create({
          data: {
            type: SyncType.RESULT_UPSERT,
            status: SyncStatus.PENDING,
            payload: {
              items: completedOrder.items.map((item) => ({
                patientRef: completedOrder.patientId,
                orderRef: completedOrder.id,
                testRef: item.testId,
                testName: item.test.name,
                testNameAr: item.test.nameAr,
                value: item.resultValue!,
                unit: item.test.unit,
                referenceRange: item.test.referenceRange,
                flag: item.flag || null,
                completedAt: completedAt.toISOString(),
              })),
            },
          },
        });

        return completedOrder;
      },
      {
        maxWait: 15000,
        timeout: 20000,
      },
    );
  }

  // ===================== REISSUE PORTAL CREDENTIALS =====================

  async reissuePortalAccount(patientId: string, staffUserId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      include: { portalAccountLocal: true },
    });

    if (!patient) {
      throw new NotFoundException(`Patient with ID ${patientId} not found`);
    }

    const newPlainPassword = generatePortalPassword(10);
    const newPasswordHash = await bcrypt.hash(newPlainPassword, 10);
    const reissuedAt = new Date();

    return this.prisma.$transaction(
      async (tx) => {
        let portalUserId: string;

        if (patient.portalAccountLocal) {
          portalUserId = patient.portalAccountLocal.portalUserId;
          await tx.portalAccountLocal.update({
            where: { patientId },
            data: {
              passwordHash: newPasswordHash,
              reissuedAt,
            },
          });
        } else {
          // If patient never had an account, create one
          portalUserId = generatePortalUserId(8);
          await tx.portalAccountLocal.create({
            data: {
              patientId,
              portalUserId,
              passwordHash: newPasswordHash,
              reissuedAt,
            },
          });
        }

        const forcePasswordChange =
          process.env.FORCE_PASSWORD_CHANGE === 'true';

        // Queue ACCOUNT_UPSERT in sync_outbox
        await tx.syncOutbox.create({
          data: {
            type: SyncType.ACCOUNT_UPSERT,
            status: SyncStatus.PENDING,
            payload: {
              patientRef: patient.id,
              portalUserId,
              passwordHash: newPasswordHash,
              patientName: patient.name,
              mustChangePassword: forcePasswordChange,
            },
          },
        });

        // Audit log entry for credential reissue
        await tx.auditLog.create({
          data: {
            userId: staffUserId,
            action: 'CREDENTIAL_REISSUE',
            targetType: 'portal_accounts_local',
            targetId: patientId,
            details: {
              patientId,
              portalUserId,
              reissuedAt: reissuedAt.toISOString(),
            },
          },
        });

        return {
          portalUserId,
          plainPassword: newPlainPassword,
          reissuedAt,
        };
      },
      {
        maxWait: 15000,
        timeout: 20000,
      },
    );
  }
}
