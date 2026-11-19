import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PatientsService } from './patients.service';
import { CreatePatientDto, UpdatePatientDto } from './dto/patient.dto';
import { Roles } from '../auth/roles.decorator';
import { StaffRole } from '@prisma/client';

@ApiTags('Patients')
@Controller('patients')
@Roles(StaffRole.FRONT_DESK, StaffRole.ADMIN)
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get()
  @ApiOperation({ summary: 'Search patients by phone or name (Arabic letter normalized)' })
  search(@Query('query') query?: string) {
    return this.patientsService.search(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get patient profile and history' })
  findOne(@Param('id') id: string) {
    return this.patientsService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Register a new patient' })
  create(@Body() dto: CreatePatientDto) {
    return this.patientsService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update patient contact details' })
  update(@Param('id') id: string, @Body() dto: UpdatePatientDto) {
    return this.patientsService.update(id, dto);
  }
}
