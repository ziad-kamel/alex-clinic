import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AppointmentsService } from './appointments.service';
import { BookAppointmentDto } from './dto/book-appointment.dto';
import { Public, Roles } from '../auth/roles.decorator';
import { StaffRole } from '@prisma/client';
import { Request } from 'express';
import {
  PublicBookAppointmentDto,
  PublicBookingAvailabilityQueryDto,
  PublicBookingDoctorsQueryDto,
} from './dto/public-booking.dto';
import { PublicBookingGatewayGuard } from './public-booking-gateway.guard';

@ApiTags('Appointments')
@Controller()
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Get('public/booking/specializations')
  @Public()
  @UseGuards(PublicBookingGatewayGuard)
  @ApiOperation({ summary: 'List specializations available for online booking' })
  getPublicBookingSpecializations() {
    return this.appointmentsService.getPublicBookingSpecializations();
  }

  @Get('public/booking/doctors')
  @Public()
  @UseGuards(PublicBookingGatewayGuard)
  @ApiOperation({ summary: 'List active doctors for a specialization' })
  getPublicBookingDoctors(@Query() query: PublicBookingDoctorsQueryDto) {
    return this.appointmentsService.getPublicBookingDoctors(query.specializationId);
  }

  @Get('public/booking/availability')
  @Public()
  @UseGuards(PublicBookingGatewayGuard)
  @ApiOperation({ summary: 'List bookable dates for an active doctor' })
  getPublicBookingAvailability(@Query() query: PublicBookingAvailabilityQueryDto) {
    return this.appointmentsService.getPublicBookingAvailability(
      query.doctorId,
      query.from,
      query.to,
    );
  }

  @Post('public/appointments')
  @Public()
  @UseGuards(PublicBookingGatewayGuard)
  @ApiOperation({ summary: 'Create an appointment through the signed portal gateway' })
  bookPublicAppointment(@Body() dto: PublicBookAppointmentDto) {
    return this.appointmentsService.bookPublicAppointment(dto);
  }

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
    @Query('doctorId') doctorId?: string,
  ) {
    return this.appointmentsService.getDoctorQueue(req.user, date, doctorId);
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
