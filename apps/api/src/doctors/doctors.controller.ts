import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { DoctorsService } from './doctors.service';
import {
  CreateSpecializationDto,
  CreateDoctorDto,
  UpdateDoctorDto,
  SetDoctorScheduleDto,
} from './dto/doctor.dto';
import { Roles } from '../auth/roles.decorator';
import { StaffRole } from '@prisma/client';

@ApiTags('Doctors & Specializations')
@Controller()
export class DoctorsController {
  constructor(private readonly doctorsService: DoctorsService) {}

  // Specializations
  @Get('specializations')
  @Roles(StaffRole.ADMIN, StaffRole.FRONT_DESK)
  @ApiOperation({ summary: 'List all medical specializations' })
  listSpecializations() {
    return this.doctorsService.listSpecializations();
  }

  @Post('specializations')
  @Roles(StaffRole.ADMIN)
  @ApiOperation({ summary: 'Create a new medical specialization' })
  createSpecialization(@Body() dto: CreateSpecializationDto) {
    return this.doctorsService.createSpecialization(dto);
  }

  // Doctors
  @Get('doctors')
  @Roles(StaffRole.ADMIN, StaffRole.FRONT_DESK, StaffRole.DOCTOR)
  @ApiOperation({ summary: 'List active doctors and their schedules' })
  listDoctors(@Query('all') all?: string) {
    return this.doctorsService.listDoctors(all !== 'true');
  }

  @Get('doctors/:id')
  @Roles(StaffRole.ADMIN, StaffRole.FRONT_DESK)
  @ApiOperation({ summary: 'Get doctor details with schedules' })
  findDoctor(@Param('id') id: string) {
    return this.doctorsService.findDoctor(id);
  }

  @Post('doctors')
  @Roles(StaffRole.ADMIN)
  @ApiOperation({ summary: 'Register a new doctor' })
  createDoctor(@Body() dto: CreateDoctorDto) {
    return this.doctorsService.createDoctor(dto);
  }

  @Patch('doctors/:id')
  @Roles(StaffRole.ADMIN)
  @ApiOperation({ summary: 'Update doctor information or status' })
  updateDoctor(@Param('id') id: string, @Body() dto: UpdateDoctorDto) {
    return this.doctorsService.updateDoctor(id, dto);
  }

  @Post('doctors/:id/schedules')
  @Roles(StaffRole.ADMIN)
  @ApiOperation({ summary: 'Set weekly schedules for a doctor' })
  setSchedules(
    @Param('id') id: string,
    @Body() schedules: SetDoctorScheduleDto[],
  ) {
    return this.doctorsService.setSchedules(id, schedules);
  }
}
