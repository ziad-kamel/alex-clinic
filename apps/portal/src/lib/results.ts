import type { Prisma } from '@prisma/client-portal';
import type { PortalResult } from '@prisma/client-portal';
import { prisma } from './db';

export interface OrderResults {
  orderRef: string;
  completedAt: Date;
  items: PortalResult[];
}

interface PatientResultsOptions {
  orderRef?: string;
  orderBy?:
    | Prisma.PortalResultOrderByWithRelationInput
    | Prisma.PortalResultOrderByWithRelationInput[];
}

export function getClinicTimeZone() {
  const timeZone = process.env.CLINIC_TIMEZONE;
  if (!timeZone) throw new Error('CLINIC_TIMEZONE is required');
  return timeZone;
}

export function getPatientResults(
  patientRef: string,
  options: PatientResultsOptions = {},
) {
  return prisma.portalResult.findMany({
    where: { patientRef, orderRef: options.orderRef },
    orderBy: options.orderBy,
  });
}

export function groupResultsByOrder(results: PortalResult[]): OrderResults[] {
  const grouped = new Map<string, OrderResults>();
  for (const result of results) {
    const order = grouped.get(result.orderRef);
    if (order) {
      order.items.push(result);
      if (result.completedAt > order.completedAt) {
        order.completedAt = result.completedAt;
      }
    } else {
      grouped.set(result.orderRef, {
        orderRef: result.orderRef,
        completedAt: result.completedAt,
        items: [result],
      });
    }
  }
  return [...grouped.values()];
}
