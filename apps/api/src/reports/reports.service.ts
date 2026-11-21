import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Appointments grouped by doctor per day.
   * Optional date range (from, to). If not provided, defaults to the last 7 days.
   */
  async getAppointmentsPerDoctorPerDay(from?: string, to?: string) {
    let fromDate: Date;
    let toDate: Date;

    if (from) {
      const [y, m, d] = from.split('-').map(Number);
      fromDate = new Date(Date.UTC(y, m - 1, d));
    } else {
      const now = new Date();
      fromDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - 7));
    }

    if (to) {
      const [y, m, d] = to.split('-').map(Number);
      toDate = new Date(Date.UTC(y, m - 1, d));
    } else {
      const now = new Date();
      toDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    }

    const appointments = await this.prisma.appointment.findMany({
      where: {
        appointmentDate: {
          gte: fromDate,
          lte: toDate,
        },
      },
      include: {
        doctor: {
          include: {
            specialization: true,
          },
        },
      },
      orderBy: [
        { appointmentDate: 'desc' },
        { doctor: { name: 'asc' } },
      ],
    });

    // Grouping by date (YYYY-MM-DD) and then by doctor
    const groupedMap = new Map<string, Map<string, {
      doctorId: string;
      doctorName: string;
      doctorNameAr?: string | null;
      specialization: string;
      specializationAr?: string | null;
      total: number;
      booked: number;
      seen: number;
      cancelled: number;
    }>>();

    for (const app of appointments) {
      const dateKey = app.appointmentDate.toISOString().split('T')[0];
      if (!groupedMap.has(dateKey)) {
        groupedMap.set(dateKey, new Map());
      }
      const dayMap = groupedMap.get(dateKey)!;

      if (!dayMap.has(app.doctorId)) {
        dayMap.set(app.doctorId, {
          doctorId: app.doctorId,
          doctorName: app.doctor.name,
          doctorNameAr: app.doctor.nameAr,
          specialization: app.doctor.specialization.name,
          specializationAr: app.doctor.specialization.nameAr,
          total: 0,
          booked: 0,
          seen: 0,
          cancelled: 0,
        });
      }

      const docStat = dayMap.get(app.doctorId)!;
      docStat.total += 1;
      if (app.status === 'BOOKED') docStat.booked += 1;
      else if (app.status === 'SEEN') docStat.seen += 1;
      else if (app.status === 'CANCELLED') docStat.cancelled += 1;
    }

    const result: Array<{
      date: string;
      doctors: Array<{
        doctorId: string;
        doctorName: string;
        doctorNameAr?: string | null;
        specialization: string;
        specializationAr?: string | null;
        total: number;
        booked: number;
        seen: number;
        cancelled: number;
      }>;
    }> = [];

    for (const [date, docs] of groupedMap.entries()) {
      result.push({
        date,
        doctors: Array.from(docs.values()),
      });
    }

    return result;
  }

  /**
   * Lab orders summary per day.
   * Optional date range (from, to). If not provided, defaults to the last 7 days.
   */
  async getLabOrdersPerDay(from?: string, to?: string) {
    let fromDate: Date;
    let toDate: Date;

    if (from) {
      const [y, m, d] = from.split('-').map(Number);
      fromDate = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
    } else {
      const now = new Date();
      fromDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - 7, 0, 0, 0, 0));
    }

    if (to) {
      const [y, m, d] = to.split('-').map(Number);
      toDate = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
    } else {
      const now = new Date();
      toDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999));
    }

    const orders = await this.prisma.labOrder.findMany({
      where: {
        createdAt: {
          gte: fromDate,
          lte: toDate,
        },
      },
      include: {
        items: {
          include: {
            test: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const dayMap = new Map<string, {
      date: string;
      totalOrders: number;
      booked: number;
      inProgress: number;
      completed: number;
      cancelled: number;
      totalTests: number;
    }>();

    for (const order of orders) {
      const dateKey = order.createdAt.toISOString().split('T')[0];
      if (!dayMap.has(dateKey)) {
        dayMap.set(dateKey, {
          date: dateKey,
          totalOrders: 0,
          booked: 0,
          inProgress: 0,
          completed: 0,
          cancelled: 0,
          totalTests: 0,
        });
      }

      const dayStat = dayMap.get(dateKey)!;
      dayStat.totalOrders += 1;
      dayStat.totalTests += order.items.length;

      if (order.status === 'BOOKED') dayStat.booked += 1;
      else if (order.status === 'IN_PROGRESS') dayStat.inProgress += 1;
      else if (order.status === 'COMPLETED') dayStat.completed += 1;
      else if (order.status === 'CANCELLED') dayStat.cancelled += 1;
    }

    return Array.from(dayMap.values());
  }
}
