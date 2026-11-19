import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePatientDto, UpdatePatientDto } from './dto/patient.dto';
import { normalizeArabicText } from '@clinic/shared';

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  async search(query?: string) {
    if (!query || query.trim().length === 0) {
      return this.prisma.patient.findMany({
        take: 50,
        orderBy: { createdAt: 'desc' },
      });
    }

    const cleanQuery = query.trim();
    const normalized = normalizeArabicText(cleanQuery);

    // Patients can be searched by phone or name
    // We fetch matching records and also match normalized variants
    const matches = await this.prisma.patient.findMany({
      where: {
        OR: [
          { phone: { contains: cleanQuery } },
          { extraPhone: { contains: cleanQuery } },
          { name: { contains: cleanQuery, mode: 'insensitive' } },
        ],
      },
      take: 50,
      orderBy: { createdAt: 'desc' },
    });

    // Also check normalized Arabic matches if the direct query returned fewer results
    if (matches.length < 50) {
      const allRecent = await this.prisma.patient.findMany({
        take: 200,
        orderBy: { createdAt: 'desc' },
      });

      const existingIds = new Set(matches.map((m) => m.id));
      for (const p of allRecent) {
        if (!existingIds.has(p.id)) {
          const normPatientName = normalizeArabicText(p.name);
          if (normPatientName.includes(normalized)) {
            matches.push(p);
          }
        }
      }
    }

    return matches;
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
