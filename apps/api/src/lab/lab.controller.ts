import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { LabService } from './lab.service';
import {
  CreateLabTestDto,
  UpdateLabTestDto,
  BookLabOrderDto,
  EnterResultDto,
} from './dto/lab.dto';
import { Roles } from '../auth/roles.decorator';
import { StaffRole, LabOrderStatus } from '@prisma/client';
import { Request } from 'express';

@ApiTags('Laboratory')
@Controller()
export class LabController {
  constructor(private readonly labService: LabService) {}

  // ===================== LAB TEST CATALOG =====================

  @Get('lab-tests')
  @Roles(StaffRole.ADMIN, StaffRole.FRONT_DESK, StaffRole.LAB)
  @ApiOperation({ summary: 'List lab test catalog' })
  getTests(@Query('all') all?: string) {
    const activeOnly = all !== 'true';
    return this.labService.getTests(activeOnly);
  }

  @Get('lab-tests/:id')
  @Roles(StaffRole.ADMIN, StaffRole.FRONT_DESK, StaffRole.LAB)
  @ApiOperation({ summary: 'Get lab test by ID' })
  getTestById(@Param('id') id: string) {
    return this.labService.getTestById(id);
  }

  @Post('lab-tests')
  @Roles(StaffRole.ADMIN)
  @ApiOperation({ summary: 'Create new lab test in catalog' })
  createTest(@Body() dto: CreateLabTestDto) {
    return this.labService.createTest(dto);
  }

  @Patch('lab-tests/:id')
  @Roles(StaffRole.ADMIN)
  @ApiOperation({ summary: 'Update lab test' })
  updateTest(@Param('id') id: string, @Body() dto: UpdateLabTestDto) {
    return this.labService.updateTest(id, dto);
  }

  @Delete('lab-tests/:id')
  @Roles(StaffRole.ADMIN)
  @ApiOperation({ summary: 'Deactivate lab test' })
  deleteTest(@Param('id') id: string) {
    return this.labService.deleteTest(id);
  }

  // ===================== AUDIT LOG =====================

  @Get('audit-log')
  @Roles(StaffRole.ADMIN)
  @ApiOperation({ summary: 'Get audit log entries including before and after values' })
  getAuditLogs(
    @Query('action') action?: string,
    @Query('limit') limit?: number,
  ) {
    return this.labService.getAuditLogs(action, limit);
  }

  // ===================== LAB ORDERS =====================

  @Post('lab-orders')
  @Roles(StaffRole.FRONT_DESK, StaffRole.LAB, StaffRole.ADMIN)
  @ApiOperation({
    summary:
      'Book a lab order for a patient and auto-generate portal account if needed',
  })
  bookLabOrder(
    @Body() dto: BookLabOrderDto,
    @Req() req: Request & { user: any },
  ) {
    return this.labService.bookLabOrder(dto, req.user.id);
  }

  @Get('lab-orders')
  @Roles(StaffRole.LAB, StaffRole.FRONT_DESK, StaffRole.ADMIN)
  @ApiOperation({ summary: 'List lab orders with filters' })
  getLabOrders(
    @Query('status') status?: LabOrderStatus,
    @Query('date') date?: string,
    @Query('patientId') patientId?: string,
  ) {
    return this.labService.getLabOrders(status, date, patientId);
  }

  @Get('lab-orders/:id')
  @Roles(StaffRole.LAB, StaffRole.FRONT_DESK, StaffRole.ADMIN)
  @ApiOperation({ summary: 'Get lab order details with items and tests' })
  getLabOrderById(@Param('id') id: string) {
    return this.labService.getLabOrderById(id);
  }

  @Get('lab-orders/:id/receipt')
  @Roles(StaffRole.FRONT_DESK, StaffRole.LAB, StaffRole.ADMIN)
  @ApiOperation({ summary: 'Get 80mm lab receipt data' })
  getLabOrderReceipt(@Param('id') id: string) {
    return this.labService.getLabOrderReceipt(id);
  }

  // ===================== RESULTS ENTRY & COMPLETION =====================

  @Put('lab-orders/:id/items/:itemId/result')
  @Roles(StaffRole.LAB, StaffRole.ADMIN)
  @ApiOperation({ summary: 'Enter or edit result for a lab test item' })
  enterResult(
    @Param('id') orderId: string,
    @Param('itemId') itemId: string,
    @Body() dto: EnterResultDto,
    @Req() req: Request & { user: any },
  ) {
    return this.labService.enterResult(
      orderId,
      itemId,
      dto,
      req.user.id,
      req.user.role,
    );
  }

  @Post('lab-orders/:id/complete')
  @Roles(StaffRole.LAB, StaffRole.ADMIN)
  @ApiOperation({ summary: 'Complete lab order and queue portal sync' })
  completeLabOrder(
    @Param('id') orderId: string,
    @Req() req: Request & { user: any },
  ) {
    return this.labService.completeLabOrder(orderId, req.user.id);
  }

  // ===================== CREDENTIAL REISSUE =====================

  @Post('patients/:id/portal-account/reissue')
  @Roles(StaffRole.FRONT_DESK, StaffRole.ADMIN)
  @ApiOperation({
    summary: 'Reissue patient portal credentials and queue sync',
  })
  reissuePortalAccount(
    @Param('id') patientId: string,
    @Req() req: Request & { user: any },
  ) {
    return this.labService.reissuePortalAccount(patientId, req.user.id);
  }
}
