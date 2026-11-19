import { z } from 'zod';

export const StaffRole = {
  ADMIN: 'ADMIN',
  FRONT_DESK: 'FRONT_DESK',
  DOCTOR: 'DOCTOR',
  LAB: 'LAB',
} as const;

export type StaffRole = (typeof StaffRole)[keyof typeof StaffRole];

export const AppointmentStatus = {
  BOOKED: 'BOOKED',
  SEEN: 'SEEN',
  CANCELLED: 'CANCELLED',
  NO_SHOW: 'NO_SHOW',
} as const;

export type AppointmentStatus = (typeof AppointmentStatus)[keyof typeof AppointmentStatus];

export const LabOrderStatus = {
  BOOKED: 'BOOKED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export type LabOrderStatus = (typeof LabOrderStatus)[keyof typeof LabOrderStatus];

export const TestResultFlag = {
  NORMAL: 'NORMAL',
  HIGH: 'HIGH',
  LOW: 'LOW',
} as const;

export type TestResultFlag = (typeof TestResultFlag)[keyof typeof TestResultFlag];

// Sync payload schemas (Local API -> Portal)
export const SyncAccountPayloadSchema = z.object({
  patientRef: z.string().uuid(),
  portalUserId: z.string().length(8),
  passwordHash: z.string(),
  patientName: z.string().min(1),
  mustChangePassword: z.boolean().default(false),
});

export type SyncAccountPayload = z.infer<typeof SyncAccountPayloadSchema>;

export const SyncResultItemSchema = z.object({
  patientRef: z.string().uuid(),
  orderRef: z.string().uuid(),
  testRef: z.string().uuid(),
  testName: z.string().min(1),
  testNameAr: z.string().nullable().optional(),
  value: z.string().min(1),
  unit: z.string().nullable().optional(),
  referenceRange: z.string().nullable().optional(),
  flag: z.enum(['NORMAL', 'HIGH', 'LOW']).nullable().optional(),
  completedAt: z.string().datetime(),
});

export const SyncResultsPayloadSchema = z.object({
  items: z.array(SyncResultItemSchema).min(1),
});

export type SyncResultsPayload = z.infer<typeof SyncResultsPayloadSchema>;

// Arabic normalization helper
export function normalizeArabicText(text: string): string {
  return text
    // Replace alef variants with bare alef
    .replace(/[أإآ]/g, 'ا')
    // Replace alif maksura with yaa
    .replace(/ى/g, 'ي')
    // Replace taa marbuta with haa for resilient search
    .replace(/ة/g, 'ه')
    // Remove Arabic diacritics (tashkeel)
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .trim();
}
