import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { Roles } from '../auth/roles.decorator';
import { StaffRole } from '@prisma/client';

@ApiTags('Reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('appointments-per-doctor')
  @Roles(StaffRole.ADMIN)
  @ApiOperation({ summary: 'Appointments per doctor per day report' })
  getAppointmentsPerDoctor(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reportsService.getAppointmentsPerDoctorPerDay(from, to);
  }

  @Get('lab-orders-per-day')
  @Roles(StaffRole.ADMIN)
  @ApiOperation({ summary: 'Lab orders per day report' })
  getLabOrdersPerDay(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reportsService.getLabOrdersPerDay(from, to);
  }
}
