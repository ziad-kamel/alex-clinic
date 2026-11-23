import { Module } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { AppointmentsController } from './appointments.controller';
import { PublicBookingGatewayGuard } from './public-booking-gateway.guard';

@Module({
  providers: [AppointmentsService, PublicBookingGatewayGuard],
  controllers: [AppointmentsController],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
