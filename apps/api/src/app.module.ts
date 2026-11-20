import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { PatientsModule } from './patients/patients.module';
import { DoctorsModule } from './doctors/doctors.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { LabModule } from './lab/lab.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { ScheduleModule } from '@nestjs/schedule';
import { SyncModule } from './sync/sync.module';

@Module({
  imports: [
    PrismaModule,
    ScheduleModule.forRoot(),
    AuthModule,
    PatientsModule,
    DoctorsModule,
    AppointmentsModule,
    LabModule,
    SyncModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
