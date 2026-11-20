import { Test } from '@nestjs/testing';
import { createHmac } from 'node:crypto';
import { SyncStatus, SyncType } from '@prisma/client';
import {
  SyncAccountPayloadSchema,
  SyncResultsPayloadSchema,
} from '@clinic/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncService } from '../sync.service';

describe('SyncService', () => {
  const secret = 'sync-test-secret-0123456789-abcdef';
  let service: SyncService;
  let prisma: {
    syncOutbox: {
      findMany: jest.Mock;
      updateMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
    labOrder: { updateMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      syncOutbox: {
        findMany: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      labOrder: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      $transaction: jest.fn(async (operation: unknown) => {
        if (typeof operation === 'function') {
          return operation(prisma);
        }
        return Promise.all(operation as Promise<unknown>[]);
      }),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [SyncService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(SyncService);

    process.env.PORTAL_SYNC_URL = 'https://portal.example.test';
    process.env.SYNC_SECRET = secret;
    process.env.SYNC_MAX_ATTEMPTS = '2';
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('signs the exact JSON body and marks an account outbox row sent', async () => {
    const payload = {
      patientRef: '9a8b7c6d-5e4f-4321-9876-123456789012',
      portalUserId: 'ABCDEFG2',
      passwordHash:
        '$2a$10$12345678901234567890123456789012345678901234567890123',
      patientName: 'Test Patient',
      mustChangePassword: false,
    };
    prisma.syncOutbox.findMany.mockResolvedValue([
      {
        id: 'outbox-1',
        type: SyncType.ACCOUNT_UPSERT,
        payload,
        attempts: 0,
      },
    ]);
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));

    await service.processPendingOutbox();

    const [url, options] = fetchMock.mock.calls[0];
    const body = options?.body as string;
    const headers = options?.headers as Record<string, string>;
    expect(String(url)).toBe('https://portal.example.test/api/sync/accounts');
    expect(headers['X-Signature']).toBe(
      createHmac('sha256', secret)
        .update(`${headers['X-Timestamp']}.${body}`, 'utf8')
        .digest('hex'),
    );
    expect(prisma.syncOutbox.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'outbox-1', status: SyncStatus.PENDING },
        data: expect.objectContaining({
          status: SyncStatus.SENT,
          attempts: 1,
        }),
      }),
    );
  });

  it('schedules a failed result row for exponential retry', async () => {
    const payload = {
      items: [
        {
          patientRef: '9a8b7c6d-5e4f-4321-9876-123456789012',
          orderRef: '8a8b7c6d-5e4f-4321-9876-123456789012',
          testRef: '7a8b7c6d-5e4f-4321-9876-123456789012',
          testName: 'Glucose',
          value: '92',
          completedAt: '2026-11-20T00:00:00.000Z',
        },
      ],
    };
    prisma.syncOutbox.findMany.mockResolvedValue([
      {
        id: 'outbox-2',
        type: SyncType.RESULT_UPSERT,
        payload,
        attempts: 0,
      },
    ]);
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 503 }));

    const before = Date.now();
    await service.processPendingOutbox();

    const update = prisma.syncOutbox.updateMany.mock.calls[0][0];
    expect(update.data.status).toBe(SyncStatus.PENDING);
    expect(update.data.attempts).toBe(1);
    expect(update.data.lastError).toBe('Portal returned HTTP 503');
    expect(update.data.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(
      before + 30_000,
    );
    expect(update.data.nextAttemptAt.getTime()).toBeLessThanOrEqual(
      Date.now() + 30_000,
    );
  });

  it('does not skip an older row while its retry delay is active', async () => {
    prisma.syncOutbox.findMany.mockResolvedValue([
      {
        id: 'outbox-old',
        type: SyncType.ACCOUNT_UPSERT,
        payload: {},
        attempts: 1,
        nextAttemptAt: new Date(Date.now() + 60_000),
      },
      {
        id: 'outbox-new',
        type: SyncType.ACCOUNT_UPSERT,
        payload: {},
        attempts: 0,
        nextAttemptAt: null,
      },
    ]);
    const fetchMock = jest.spyOn(global, 'fetch');

    await service.processPendingOutbox();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.syncOutbox.updateMany).not.toHaveBeenCalled();
  });

  it('marks a result row failed after the configured maximum attempts', async () => {
    prisma.syncOutbox.findMany.mockResolvedValue([
      {
        id: 'outbox-3',
        type: SyncType.ACCOUNT_UPSERT,
        payload: { invalid: true },
        attempts: 1,
      },
    ]);

    await service.processPendingOutbox();

    expect(prisma.syncOutbox.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'outbox-3', status: SyncStatus.PENDING },
        data: expect.objectContaining({
          status: SyncStatus.FAILED,
          attempts: 2,
          nextAttemptAt: null,
        }),
      }),
    );
  });

  it('rejects plaintext credential sync and cross-order result batches', () => {
    expect(
      SyncAccountPayloadSchema.safeParse({
        patientRef: '9a8b7c6d-5e4f-4321-9876-123456789012',
        portalUserId: 'ABCDEFG2',
        passwordHash: 'plaintext-password',
        patientName: 'Test Patient',
        mustChangePassword: false,
      }).success,
    ).toBe(false);

    const item = {
      patientRef: '9a8b7c6d-5e4f-4321-9876-123456789012',
      orderRef: '8a8b7c6d-5e4f-4321-9876-123456789012',
      testRef: '7a8b7c6d-5e4f-4321-9876-123456789012',
      testName: 'Glucose',
      value: '92',
      completedAt: '2026-11-20T00:00:00.000Z',
    };
    expect(
      SyncResultsPayloadSchema.safeParse({
        items: [
          item,
          {
            ...item,
            testRef: '6a8b7c6d-5e4f-4321-9876-123456789012',
            orderRef: '5a8b7c6d-5e4f-4321-9876-123456789012',
          },
        ],
      }).success,
    ).toBe(false);
  });
});
