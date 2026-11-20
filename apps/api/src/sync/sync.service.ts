import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma, SyncStatus, SyncType } from '@prisma/client';
import {
  SyncAccountPayloadSchema,
  SyncResultsPayloadSchema,
} from '@clinic/shared';
import { createHmac } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

const BATCH_SIZE = 20;
const REQUEST_TIMEOUT_MS = 15_000;
const BASE_RETRY_DELAY_MS = 30_000;
const MAX_RETRY_DELAY_MS = 60 * 60 * 1000;

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
  private isProcessing = false;

  constructor(private readonly prisma: PrismaService) {}

  @Cron('*/30 * * * * *')
  async processPendingOutbox() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const now = new Date();
      const rows = await this.prisma.syncOutbox.findMany({
        where: { status: SyncStatus.PENDING },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: BATCH_SIZE,
      });

      for (const row of rows) {
        if (row.nextAttemptAt && row.nextAttemptAt > now) break;
        if (!(await this.processRow(row))) break;
      }
    } catch (error) {
      this.logger.error(
        'Unable to process synchronization outbox batch',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.isProcessing = false;
    }
  }

  async listOutbox(
    status: SyncStatus | undefined,
    page: number,
    limit: number,
  ) {
    const where: Prisma.SyncOutboxWhereInput = status ? { status } : {};
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.syncOutbox.count({ where }),
      this.prisma.syncOutbox.findMany({
        where,
        select: {
          id: true,
          type: true,
          status: true,
          attempts: true,
          lastError: true,
          nextAttemptAt: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: rows,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async retryOutbox(id: string) {
    const row = await this.prisma.syncOutbox.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!row) {
      throw new NotFoundException('Sync outbox row not found');
    }
    if (row.status !== SyncStatus.FAILED) {
      throw new BadRequestException('Only failed sync rows can be retried');
    }

    await this.prisma.syncOutbox.update({
      where: { id },
      data: {
        status: SyncStatus.PENDING,
        attempts: 0,
        lastError: null,
        nextAttemptAt: null,
      },
    });
    return { success: true };
  }

  private async processRow(row: Prisma.SyncOutboxGetPayload<object>) {
    const attempt = row.attempts + 1;
    try {
      const { path, payload, orderRefs } = this.getValidatedPayload(
        row.type,
        row.payload,
      );
      await this.sendPayload(path, payload);

      await this.prisma.$transaction(async (tx) => {
        await tx.syncOutbox.updateMany({
          where: { id: row.id, status: SyncStatus.PENDING },
          data: {
            status: SyncStatus.SENT,
            attempts: attempt,
            lastError: null,
            nextAttemptAt: null,
          },
        });
        if (orderRefs.length > 0) {
          await tx.labOrder.updateMany({
            where: { id: { in: orderRefs } },
            data: { syncedAt: new Date() },
          });
        }
      });
      return true;
    } catch (error) {
      const maxAttempts = this.getMaxAttempts();
      const failedPermanently = attempt >= maxAttempts;
      const nextAttemptAt = failedPermanently
        ? null
        : new Date(
            Date.now() +
              Math.min(
                BASE_RETRY_DELAY_MS * 2 ** (attempt - 1),
                MAX_RETRY_DELAY_MS,
              ),
          );
      const message = this.getSafeErrorMessage(error);

      await this.prisma.syncOutbox.updateMany({
        where: { id: row.id, status: SyncStatus.PENDING },
        data: {
          status: failedPermanently ? SyncStatus.FAILED : SyncStatus.PENDING,
          attempts: attempt,
          lastError: message,
          nextAttemptAt,
        },
      });
      this.logger.warn(
        `Sync outbox row ${row.id} attempt ${attempt} failed: ${message}`,
      );
      return false;
    }
  }

  private getValidatedPayload(type: SyncType, payload: Prisma.JsonValue) {
    if (type === SyncType.ACCOUNT_UPSERT) {
      const parsed = SyncAccountPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error(
          `Invalid account payload: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`,
        );
      }
      return {
        path: 'accounts',
        payload: parsed.data,
        orderRefs: [] as string[],
      };
    }

    const parsed = SyncResultsPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      throw new Error(
        `Invalid result payload: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`,
      );
    }
    return {
      path: 'results',
      payload: parsed.data,
      orderRefs: [...new Set(parsed.data.items.map((item) => item.orderRef))],
    };
  }

  private async sendPayload(path: string, payload: unknown) {
    const baseUrl = process.env.PORTAL_SYNC_URL;
    const secret = process.env.SYNC_SECRET;
    if (!baseUrl) throw new Error('PORTAL_SYNC_URL is not configured');
    if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
      throw new Error('SYNC_SECRET must contain at least 32 bytes');
    }

    const endpoint = new URL(`/api/sync/${path}`, baseUrl);
    if (
      process.env.NODE_ENV === 'production' &&
      endpoint.protocol !== 'https:'
    ) {
      throw new Error('Portal sync endpoint must use HTTPS in production');
    }

    const rawBody = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody}`, 'utf8')
      .digest('hex');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Timestamp': timestamp,
          'X-Signature': signature,
        },
        body: rawBody,
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Portal returned HTTP ${response.status}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  private getMaxAttempts() {
    const maxAttempts = Number(process.env.SYNC_MAX_ATTEMPTS ?? 10);
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
      throw new Error('SYNC_MAX_ATTEMPTS must be a positive integer');
    }
    return maxAttempts;
  }

  private getSafeErrorMessage(error: unknown) {
    if (error instanceof Error) {
      if (error.message.startsWith('Invalid account payload:'))
        return error.message;
      if (error.message.startsWith('Invalid result payload:'))
        return error.message;
      if (error.message.startsWith('Portal returned HTTP '))
        return error.message;
      if (error.message === 'SYNC_SECRET must contain at least 32 bytes')
        return error.message;
      if (error.message === 'PORTAL_SYNC_URL is not configured')
        return error.message;
      if (error.message === 'Portal sync endpoint must use HTTPS in production')
        return error.message;
    }
    return error instanceof Error
      ? `Portal request failed (${error.name})`
      : 'Portal request failed';
  }
}
