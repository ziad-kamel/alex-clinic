import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BookAppointmentDto } from './dto/book-appointment.dto';
import { PublicBookAppointmentDto } from './dto/public-booking.dto';
import { AppointmentBookingSource, AppointmentStatus, StaffRole } from '@prisma/client';
import { addDays, clinicTodayDate, parseDateOnly, toDateOnly } from './date-only';
import { normalizePatientName, normalizePatientPhone } from '../patients/patient-identity';

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async bookAppointment(dto: BookAppointmentDto, staffUserId: string) {
    const { patientId, doctorId, appointmentDate } = dto;

    // 1. Verify Patient
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
    });
    if (!patient) {
      throw new NotFoundException(`Patient with ID ${patientId} not found`);
    }

    // 2. Parse Date and Weekday
    const dateObj = parseDateOnly(appointmentDate);
    const weekday = dateObj.getUTCDay(); // 0 = Sunday, 6 = Saturday

    // 3. Verify Doctor and Schedule
    const doctor = await this.prisma.doctor.findUnique({
      where: { id: doctorId },
      include: {
        specialization: true,
        schedules: { where: { weekday } },
      },
    });

    if (!doctor || !doctor.active) {
      throw new BadRequestException('Doctor not found or inactive');
    }

    const schedule = doctor.schedules[0];
    if (!schedule) {
      throw new BadRequestException(
        `Doctor ${doctor.name} does not have a working schedule on weekday ${weekday}`,
      );
    }

    // 4. Concurrency-Safe Transactional Queue Assignment
    return this.prisma.$transaction(
      async (tx) => {
        // Lock this doctor/date counter before checking capacity. All booking
        // paths use this row so concurrent front-desk and portal bookings serialize.
        const counter = await tx.doctorDayCounter.upsert({
          where: {
            doctorId_date: {
              doctorId,
              date: dateObj,
            },
          },
          create: {
            doctorId,
            date: dateObj,
            lastNumber: 1,
          },
          update: {
            lastNumber: { increment: 1 },
          },
        });

        if (schedule.maxPatients !== null) {
          const count = await tx.appointment.count({
            where: {
              doctorId,
              appointmentDate: dateObj,
              status: { not: AppointmentStatus.CANCELLED },
            },
          });

          if (count >= schedule.maxPatients) {
            throw new ConflictException({ code: 'DATE_FULL' });
          }
        }

        const assignedQueueNumber = counter.lastNumber;

        // Create appointment
        const appointment = await tx.appointment.create({
          data: {
            patientId,
            doctorId,
            appointmentDate: dateObj,
            queueNumber: assignedQueueNumber,
            status: AppointmentStatus.BOOKED,
            createdBy: staffUserId,
            bookingSource: AppointmentBookingSource.FRONT_DESK,
          },
          include: {
            patient: true,
            doctor: {
              include: { specialization: true },
            },
          },
        });

        return {
          ...appointment,
          sessionStartTime: schedule.startTime,
          sessionEndTime: schedule.endTime,
        };
      },
      {
        maxWait: 15000, // 15 seconds to acquire a connection
        timeout: 20000, // 20 seconds transaction timeout for remote cloud latency
      },
    );
  }

  async getPublicBookingSpecializations() {
    return this.prisma.specialization.findMany({
      where: { doctors: { some: { active: true } } },
      select: { id: true, name: true, nameAr: true },
      orderBy: { name: 'asc' },
    });
  }

  async getPublicBookingDoctors(specializationId: string) {
    return this.prisma.doctor.findMany({
      where: { specializationId, active: true },
      select: { id: true, name: true, nameAr: true, specializationId: true },
      orderBy: { name: 'asc' },
    });
  }

  async getPublicBookingAvailability(doctorId: string, from: string, to: string) {
    const fromDate = parseDateOnly(from);
    const toDate = parseDateOnly(to);
    const today = clinicTodayDate();
    const rangeDays = Math.floor((toDate.getTime() - fromDate.getTime()) / 86_400_000);
    if (fromDate < today || rangeDays < 0 || rangeDays > 90) {
      throw new BadRequestException({ code: 'INVALID_DATE_RANGE' });
    }

    const doctor = await this.prisma.doctor.findUnique({
      where: { id: doctorId },
      select: {
        active: true,
        schedules: { select: { weekday: true, maxPatients: true } },
      },
    });
    if (!doctor?.active) return { dates: [] as string[] };

    const booked = await this.prisma.appointment.groupBy({
      by: ['appointmentDate'],
      where: {
        doctorId,
        appointmentDate: { gte: fromDate, lte: toDate },
        status: { not: AppointmentStatus.CANCELLED },
      },
      _count: { _all: true },
    });
    const countByDate = new Map(
      booked.map((row) => [toDateOnly(row.appointmentDate), row._count._all]),
    );
    const scheduleByWeekday = new Map(
      doctor.schedules.map((schedule) => [schedule.weekday, schedule.maxPatients]),
    );
    const dates: string[] = [];

    for (let date = fromDate; date <= toDate; date = addDays(date, 1)) {
      const maxPatients = scheduleByWeekday.get(date.getUTCDay());
      if (maxPatients === undefined) continue;
      if (maxPatients !== null && (countByDate.get(toDateOnly(date)) || 0) >= maxPatients) {
        continue;
      }
      dates.push(toDateOnly(date));
    }

    return { dates };
  }

  async bookPublicAppointment(dto: PublicBookAppointmentDto) {
    const patientName = dto.patientName.trim();
    const patientPhone = dto.patientPhone.trim();
    const normalizedName = normalizePatientName(patientName);
    const phoneNormalized = normalizePatientPhone(patientPhone);
    const appointmentDate = parseDateOnly(dto.appointmentDate);

    if (patientName.length < 2 || phoneNormalized.length < 7) {
      throw new BadRequestException({ code: 'INVALID_PATIENT_DETAILS' });
    }
    if (appointmentDate < clinicTodayDate()) {
      throw new ConflictException({ code: 'DATE_UNAVAILABLE' });
    }

    return this.prisma.$transaction(
      async (tx) => {
        const doctor = await tx.doctor.findUnique({
          where: { id: dto.doctorId },
          include: {
            specialization: true,
            schedules: { where: { weekday: appointmentDate.getUTCDay() } },
          },
        });
        if (!doctor?.active || doctor.specializationId !== dto.specializationId) {
          throw new ConflictException({ code: 'DOCTOR_UNAVAILABLE' });
        }

        const schedule = doctor.schedules[0];
        if (!schedule) {
          throw new ConflictException({ code: 'DATE_UNAVAILABLE' });
        }

        // Prevent two simultaneous bookings for one identity from creating duplicate patients.
        await tx.$queryRaw`
          SELECT pg_advisory_xact_lock(hashtext(${normalizedName}), hashtext(${phoneNormalized})) IS NOT NULL AS lock_acquired
        `;

        // This upsert locks the doctor/date row. Check capacity only after acquiring
        // that lock so online and Front Desk bookings share the same hard limit.
        const counter = await tx.doctorDayCounter.upsert({
          where: {
            doctorId_date: { doctorId: doctor.id, date: appointmentDate },
          },
          create: { doctorId: doctor.id, date: appointmentDate, lastNumber: 1 },
          update: { lastNumber: { increment: 1 } },
        });

        if (schedule.maxPatients !== null) {
          const count = await tx.appointment.count({
            where: {
              doctorId: doctor.id,
              appointmentDate,
              status: { not: AppointmentStatus.CANCELLED },
            },
          });
          if (count >= schedule.maxPatients) {
            throw new ConflictException({ code: 'DATE_FULL' });
          }
        }

        const phoneCandidates = await tx.patient.findMany({
          where: { phoneNormalized },
          select: { id: true, name: true },
        });
        const matchingPatients = phoneCandidates.filter(
          (patient) => normalizePatientName(patient.name) === normalizedName,
        );
        if (matchingPatients.length > 1) {
          throw new ConflictException({ code: 'PATIENT_MATCH_REQUIRES_REVIEW' });
        }

        const patient = matchingPatients[0]
          ? await tx.patient.findUniqueOrThrow({ where: { id: matchingPatients[0].id } })
          : await tx.patient.create({
              data: { name: patientName, phone: patientPhone, phoneNormalized },
            });

        const appointment = await tx.appointment.create({
          data: {
            patientId: patient.id,
            doctorId: doctor.id,
            appointmentDate,
            queueNumber: counter.lastNumber,
            status: AppointmentStatus.BOOKED,
            bookingSource: AppointmentBookingSource.ONLINE,
          },
        });

        return {
          id: appointment.id,
          appointmentDate: toDateOnly(appointment.appointmentDate),
          queueNumber: appointment.queueNumber,
          doctor: { id: doctor.id, name: doctor.name, nameAr: doctor.nameAr },
          specialization: {
            id: doctor.specialization.id,
            name: doctor.specialization.name,
            nameAr: doctor.specialization.nameAr,
          },
        };
      },
      { maxWait: 15000, timeout: 20000 },
    );
  }

  async listAppointments(date?: string, doctorId?: string) {
    const dateFilter = date ? parseDateOnly(date) : undefined;

    return this.prisma.appointment.findMany({
      where: {
        ...(dateFilter ? { appointmentDate: dateFilter } : {}),
        ...(doctorId ? { doctorId } : {}),
      },
      include: {
        patient: true,
        doctor: {
          include: { specialization: true },
        },
      },
      orderBy: [{ appointmentDate: 'asc' }, { queueNumber: 'asc' }],
    });
  }

  async cancelAppointment(id: string, staffUserId: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
    });
    if (!appointment) {
      throw new NotFoundException(`Appointment with ID ${id} not found`);
    }

    if (appointment.status === AppointmentStatus.CANCELLED) {
      return appointment;
    }

    const updated = await this.prisma.appointment.update({
      where: { id },
      data: { status: AppointmentStatus.CANCELLED },
      include: { patient: true, doctor: true },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: staffUserId,
        action: 'APPOINTMENT_CANCELLED',
        targetType: 'appointments',
        targetId: id,
        details: {
          queueNumber: appointment.queueNumber,
          doctorId: appointment.doctorId,
          appointmentDate: appointment.appointmentDate,
        },
      },
    });

    return updated;
  }

  async getReceiptData(id: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: {
        patient: true,
        doctor: {
          include: {
            specialization: true,
            schedules: true,
          },
        },
      },
    });

    if (!appointment) {
      throw new NotFoundException(`Appointment with ID ${id} not found`);
    }

    // Determine session start time
    const weekday = appointment.appointmentDate.getUTCDay();
    const schedule = appointment.doctor.schedules.find((s) => s.weekday === weekday);

    return {
      clinicName: process.env.CLINIC_NAME || 'Alex Clinic',
      receiptNumber: `REC-${appointment.id.substring(0, 8).toUpperCase()}`,
      patientName: appointment.patient.name,
      patientPhone: appointment.patient.phone,
      doctorName: appointment.doctor.name,
      doctorNameAr: appointment.doctor.nameAr,
      specialization: appointment.doctor.specialization.name,
      specializationAr: appointment.doctor.specialization.nameAr,
      reservedAt: appointment.reservedAt,
      appointmentDate: appointment.appointmentDate.toISOString().split('T')[0],
      queueNumber: appointment.queueNumber,
      sessionStartTime: schedule?.startTime || '09:00',
    };
  }

  // Doctor daily queue (for Doctor role)
  async getDoctorQueue(
    currentUser: { id: string; role?: StaffRole; doctorId?: string | null; name?: string; username?: string } | string,
    date?: string,
    requestedDoctorId?: string,
  ) {
    let staffUserId: string;
    let role: StaffRole = StaffRole.DOCTOR;
    let userDoctorId: string | null = null;

    if (typeof currentUser === 'string') {
      staffUserId = currentUser;
      const staffUser = await this.prisma.staffUser.findUnique({
        where: { id: staffUserId },
      });
      if (staffUser) {
        role = staffUser.role;
        userDoctorId = staffUser.doctorId;
      }
    } else {
      staffUserId = currentUser.id;
      if (currentUser.role) role = currentUser.role;
      userDoctorId = currentUser.doctorId || null;
      if (!userDoctorId) {
        const staffUser = await this.prisma.staffUser.findUnique({
          where: { id: staffUserId },
        });
        userDoctorId = staffUser?.doctorId || null;
      }
    }

    let targetDoctorId: string | null = null;

    if (role === StaffRole.ADMIN && requestedDoctorId) {
      targetDoctorId = requestedDoctorId;
    } else if (userDoctorId) {
      targetDoctorId = userDoctorId;
    } else {
      // Fallback 1: match by direct doctor ID
      const directDoc = await this.prisma.doctor.findUnique({
        where: { id: staffUserId },
      });
      if (directDoc) {
        targetDoctorId = directDoc.id;
      } else {
        // Fallback 2: match by staff user name or username
        const staffUser = await this.prisma.staffUser.findUnique({
          where: { id: staffUserId },
        });
        if (staffUser) {
          const docByName = await this.prisma.doctor.findFirst({
            where: {
              OR: [
                { name: { equals: staffUser.name, mode: 'insensitive' } },
                { name: { equals: staffUser.username, mode: 'insensitive' } },
              ],
            },
          });
          if (docByName) {
            targetDoctorId = docByName.id;
          }
        }
      }
    }

    if (!targetDoctorId) {
      return [];
    }

    let dateFilter: Date;
    if (date) {
      const [y, m, d] = date.split('-').map(Number);
      dateFilter = new Date(Date.UTC(y, m - 1, d));
    } else {
      const now = new Date();
      dateFilter = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    }

    return this.prisma.appointment.findMany({
      where: {
        doctorId: targetDoctorId,
        appointmentDate: dateFilter,
      },
      include: {
        patient: true,
      },
      orderBy: { queueNumber: 'asc' },
    });
  }

  async markAsSeen(id: string, doctorUserId: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
    });
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    return this.prisma.appointment.update({
      where: { id },
      data: { status: AppointmentStatus.SEEN },
    });
  }
}
