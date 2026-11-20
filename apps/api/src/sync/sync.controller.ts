import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SyncStatus, StaffRole } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { SyncService } from './sync.service';

@ApiTags('Sync')
@Controller('sync/outbox')
@Roles(StaffRole.ADMIN)
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Get()
  @ApiOperation({
    summary: 'List synchronization outbox rows without payload data',
  })
  list(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    if (status && !Object.values(SyncStatus).includes(status as SyncStatus)) {
      throw new BadRequestException('Invalid sync status');
    }

    return this.syncService.listOutbox(
      status as SyncStatus | undefined,
      this.parsePositiveInteger(page, 1, 'page'),
      this.parsePositiveInteger(limit, 20, 'limit', 100),
    );
  }

  @Post(':id/retry')
  @ApiOperation({ summary: 'Retry a failed synchronization row' })
  retry(@Param('id') id: string) {
    return this.syncService.retryOutbox(id);
  }

  private parsePositiveInteger(
    value: string | undefined,
    defaultValue: number,
    name: string,
    max = Number.MAX_SAFE_INTEGER,
  ) {
    if (value === undefined) return defaultValue;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
      throw new BadRequestException(`Invalid ${name}`);
    }
    return parsed;
  }
}
