import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePatientDto, UpdatePatientDto } from './dto/patient.dto';
import { normalizeArabicText } from '@clinic/shared';

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  async search(query?: string, name?: string, phone?: string, page = 1, limit = 10) {
    const pageNum = Math.max(1, Number(page) || 1);
    const take = Math.min(50, Math.max(1, Number(limit) || 10));
    const skip = (pageNum - 1) * take;

    const whereClause: any = {};

    // Specific filters if supplied
    if (phone && phone.trim()) {
      whereClause.OR = [
        { phone: { contains: phone.trim() } },
        { extraPhone: { contains: phone.trim() } },
      ];
    }

    if (name && name.trim()) {
      whereClause.name = { contains: name.trim(), mode: 'insensitive' };
    }

    // General query (matches phone OR name)
    if (query && query.trim()) {
      const cleanQuery = query.trim();
      const normalized = normalizeArabicText(cleanQuery);

      whereClause.OR = [
        { phone: { contains: cleanQuery } },
        { extraPhone: { contains: cleanQuery } },
        { name: { contains: cleanQuery, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.patient.findMany({
        where: whereClause,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.patient.count({
        where: whereClause,
      }),
    ]);

    return {
      items,
      total,
      page: pageNum,
      limit: take,
      totalPages: Math.ceil(total / take),
    };
  }

  async findOne(id: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id },
      include: {
        appointments: {
          include: {
            doctor: {
              include: { specialization: true },
            },
          },
          orderBy: { appointmentDate: 'desc' },
          take: 10,
        },
      },
    });
    if (!patient) {
      throw new NotFoundException(`Patient with ID ${id} not found`);
    }
    return patient;
  }

  async create(dto: CreatePatientDto) {
    return this.prisma.patient.create({
      data: {
        name: dto.name.trim(),
        phone: dto.phone.trim(),
        extraPhone: dto.extraPhone ? dto.extraPhone.trim() : null,
      },
    });
  }

  async update(id: string, dto: UpdatePatientDto) {
    await this.findOne(id);
    return this.prisma.patient.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.phone ? { phone: dto.phone.trim() } : {}),
        ...(dto.extraPhone !== undefined ? { extraPhone: dto.extraPhone?.trim() || null } : {}),
      },
    });
  }
}
