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
import { PatientsService } from './patients.service';
import { CreatePatientDto, UpdatePatientDto } from './dto/patient.dto';
import { Roles } from '../auth/roles.decorator';
import { StaffRole } from '@prisma/client';

@ApiTags('Patients')
@Controller('patients')
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get()
  @Roles(StaffRole.FRONT_DESK, StaffRole.LAB, StaffRole.ADMIN)
  @ApiOperation({ summary: 'Search and paginate patients by query, name, and/or phone' })
  search(
    @Query('query') query?: string,
    @Query('name') name?: string,
    @Query('phone') phone?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.patientsService.search(
      query,
      name,
      phone,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
    );
  }

  @Get(':id')
  @Roles(StaffRole.FRONT_DESK, StaffRole.LAB, StaffRole.ADMIN)
  @ApiOperation({ summary: 'Get patient profile and history' })
  findOne(@Param('id') id: string) {
    return this.patientsService.findOne(id);
  }

  @Post()
  @Roles(StaffRole.FRONT_DESK, StaffRole.LAB, StaffRole.ADMIN)
  @ApiOperation({ summary: 'Register a new patient' })
  create(@Body() dto: CreatePatientDto) {
    return this.patientsService.create(dto);
  }

  @Patch(':id')
  @Roles(StaffRole.FRONT_DESK, StaffRole.ADMIN)
  @ApiOperation({ summary: 'Update patient contact details' })
  update(@Param('id') id: string, @Body() dto: UpdatePatientDto) {
    return this.patientsService.update(id, dto);
  }
}
