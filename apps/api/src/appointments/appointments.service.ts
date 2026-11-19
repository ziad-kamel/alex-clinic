import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BookAppointmentDto } from './dto/book-appointment.dto';
import { AppointmentStatus, StaffRole } from '@prisma/client';

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
    const [year, month, day] = appointmentDate.split('-').map(Number);
    const dateObj = new Date(Date.UTC(year, month - 1, day));
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
        // Check max patients limit if configured
        if (schedule.maxPatients) {
          const count = await tx.appointment.count({
            where: {
              doctorId,
              appointmentDate: dateObj,
              status: { not: AppointmentStatus.CANCELLED },
            },
          });

          if (count >= schedule.maxPatients) {
            throw new BadRequestException(
              `Doctor ${doctor.name} has reached the maximum capacity (${schedule.maxPatients} patients) for this date`,
            );
          }
        }

        // Upsert and increment counter atomically with lock
        // doctor_day_counters: (doctor_id, date) -> last_number
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

  async listAppointments(date?: string, doctorId?: string) {
    let dateFilter: Date | undefined;
    if (date) {
      const [y, m, d] = date.split('-').map(Number);
      dateFilter = new Date(Date.UTC(y, m - 1, d));
    }

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
  async getDoctorQueue(doctorUserId: string, date?: string) {
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
        doctorId: doctorUserId,
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
