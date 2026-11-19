import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AppointmentsService } from './appointments.service';
import { BookAppointmentDto } from './dto/book-appointment.dto';
import { Roles } from '../auth/roles.decorator';
import { StaffRole } from '@prisma/client';
import { Request } from 'express';

@ApiTags('Appointments')
@Controller()
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post('appointments')
  @Roles(StaffRole.FRONT_DESK, StaffRole.ADMIN)
  @ApiOperation({ summary: 'Book an appointment and assign sequential queue number' })
  bookAppointment(
    @Body() dto: BookAppointmentDto,
    @Req() req: Request & { user: any },
  ) {
    return this.appointmentsService.bookAppointment(dto, req.user.id);
  }

  @Get('appointments')
  @Roles(StaffRole.FRONT_DESK, StaffRole.ADMIN)
  @ApiOperation({ summary: 'List appointments filtered by date and/or doctor' })
  listAppointments(
    @Query('date') date?: string,
    @Query('doctorId') doctorId?: string,
  ) {
    return this.appointmentsService.listAppointments(date, doctorId);
  }

  @Patch('appointments/:id/cancel')
  @Roles(StaffRole.FRONT_DESK, StaffRole.ADMIN)
  @ApiOperation({ summary: 'Cancel an appointment (does not renumber others)' })
  cancelAppointment(
    @Param('id') id: string,
    @Req() req: Request & { user: any },
  ) {
    return this.appointmentsService.cancelAppointment(id, req.user.id);
  }

  @Get('appointments/:id/receipt')
  @Roles(StaffRole.FRONT_DESK, StaffRole.ADMIN)
  @ApiOperation({ summary: 'Get 80mm appointment receipt data' })
  getReceiptData(@Param('id') id: string) {
    return this.appointmentsService.getReceiptData(id);
  }

  // Doctor routes
  @Get('doctor/queue')
  @Roles(StaffRole.DOCTOR, StaffRole.ADMIN)
  @ApiOperation({ summary: "Get doctor's daily appointment queue" })
  getDoctorQueue(
    @Req() req: Request & { user: any },
    @Query('date') date?: string,
  ) {
    return this.appointmentsService.getDoctorQueue(req.user.id, date);
  }

  @Patch('appointments/:id/seen')
  @Roles(StaffRole.DOCTOR, StaffRole.ADMIN)
  @ApiOperation({ summary: 'Mark patient appointment as seen' })
  markAsSeen(
    @Param('id') id: string,
    @Req() req: Request & { user: any },
  ) {
    return this.appointmentsService.markAsSeen(id, req.user.id);
  }
}
