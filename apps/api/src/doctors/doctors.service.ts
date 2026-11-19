import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateSpecializationDto,
  CreateDoctorDto,
  UpdateDoctorDto,
  SetDoctorScheduleDto,
} from './dto/doctor.dto';

@Injectable()
export class DoctorsService {
  constructor(private readonly prisma: PrismaService) {}

  // Specializations
  async listSpecializations() {
    return this.prisma.specialization.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { doctors: true } },
      },
    });
  }

  async createSpecialization(dto: CreateSpecializationDto) {
    return this.prisma.specialization.create({
      data: {
        name: dto.name.trim(),
        nameAr: dto.nameAr?.trim() || null,
      },
    });
  }

  // Doctors
  async listDoctors(activeOnly = true) {
    return this.prisma.doctor.findMany({
      where: activeOnly ? { active: true } : undefined,
      include: {
        specialization: true,
        schedules: { orderBy: { weekday: 'asc' } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findDoctor(id: string) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { id },
      include: {
        specialization: true,
        schedules: { orderBy: { weekday: 'asc' } },
      },
    });
    if (!doctor) {
      throw new NotFoundException(`Doctor with ID ${id} not found`);
    }
    return doctor;
  }

  async createDoctor(dto: CreateDoctorDto) {
    const spec = await this.prisma.specialization.findUnique({
      where: { id: dto.specializationId },
    });
    if (!spec) {
      throw new BadRequestException('Specialization not found');
    }

    return this.prisma.doctor.create({
      data: {
        name: dto.name.trim(),
        nameAr: dto.nameAr?.trim() || null,
        specializationId: dto.specializationId,
      },
      include: { specialization: true },
    });
  }

  async updateDoctor(id: string, dto: UpdateDoctorDto) {
    await this.findDoctor(id);
    return this.prisma.doctor.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr?.trim() || null } : {}),
        ...(dto.specializationId ? { specializationId: dto.specializationId } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
      include: { specialization: true },
    });
  }

  // Schedules
  async setSchedules(doctorId: string, schedules: SetDoctorScheduleDto[]) {
    await this.findDoctor(doctorId);

    return this.prisma.$transaction(async (tx) => {
      // delete existing and insert new schedules
      await tx.doctorSchedule.deleteMany({
        where: { doctorId },
      });

      return Promise.all(
        schedules.map((s) =>
          tx.doctorSchedule.create({
            data: {
              doctorId,
              weekday: s.weekday,
              startTime: s.startTime,
              endTime: s.endTime,
              maxPatients: s.maxPatients || null,
            },
          }),
        ),
      );
    });
  }
}
