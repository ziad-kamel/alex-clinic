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
export const SyncAccountPayloadSchema = z
  .object({
    patientRef: z.string().uuid(),
    portalUserId: z.string().regex(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/),
    passwordHash: z
      .string()
      .regex(/^\$2[aby]\$(\d\d)\$.{53}$/)
      .refine(
        (hash) => Number(hash.slice(4, 6)) >= 10,
        'Password hash cost must be at least 10',
      ),
    patientName: z.string().min(1),
    mustChangePassword: z.boolean().default(false),
  })
  .strict();

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

export const SyncResultsPayloadSchema = z
  .object({
    items: z.array(SyncResultItemSchema).min(1),
  })
  .strict()
  .superRefine(({ items }, ctx) => {
    const firstItem = items[0];
    if (!firstItem) return;

    const testRefs = new Set<string>();
    items.forEach((item, index) => {
      if (item.patientRef !== firstItem.patientRef) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', index, 'patientRef'],
          message: 'A sync batch must contain results for one patient',
        });
      }
      if (item.orderRef !== firstItem.orderRef) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', index, 'orderRef'],
          message: 'A sync batch must contain results for one order',
        });
      }
      if (testRefs.has(item.testRef)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', index, 'testRef'],
          message: 'A sync batch cannot contain duplicate tests',
        });
      }
      testRefs.add(item.testRef);
    });
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
