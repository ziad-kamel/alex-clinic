import { NextResponse } from 'next/server';
import { SyncResultsPayloadSchema } from '@clinic/shared';
import { prisma } from '@/lib/db';
import { readSignedBody } from '@/lib/sync-http';

export async function POST(request: Request) {
  const signedBody = await readSignedBody(request);
  if (!signedBody.success) return signedBody.response;

  const parsed = SyncResultsPayloadSchema.safeParse(signedBody.value);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid result sync payload' },
      { status: 400 },
    );
  }

  const [firstItem] = parsed.data.items;
  const account = await prisma.portalAccount.findUnique({
    where: { patientRef: firstItem.patientRef },
    select: { patientRef: true },
  });
  if (!account) {
    return NextResponse.json(
      { message: 'Portal account must be synchronized before results' },
      { status: 409 },
    );
  }

  const existingResults = await prisma.portalResult.findMany({
    where: {
      orderRef: firstItem.orderRef,
      testRef: { in: parsed.data.items.map((item) => item.testRef) },
    },
    select: { patientRef: true, orderRef: true, testRef: true },
  });
  if (
    existingResults.some((result) => result.patientRef !== firstItem.patientRef)
  ) {
    return NextResponse.json(
      { message: 'Result ownership conflict' },
      { status: 409 },
    );
  }

  await prisma.$transaction(
    parsed.data.items.map((item) =>
      prisma.portalResult.upsert({
        where: {
          orderRef_testRef: {
            orderRef: item.orderRef,
            testRef: item.testRef,
          },
        },
        create: {
          patientRef: item.patientRef,
          orderRef: item.orderRef,
          testRef: item.testRef,
          testName: item.testName,
          testNameAr: item.testNameAr ?? null,
          value: item.value,
          unit: item.unit ?? null,
          referenceRange: item.referenceRange ?? null,
          flag: item.flag ?? null,
          completedAt: new Date(item.completedAt),
        },
        update: {
          testName: item.testName,
          testNameAr: item.testNameAr ?? null,
          value: item.value,
          unit: item.unit ?? null,
          referenceRange: item.referenceRange ?? null,
          flag: item.flag ?? null,
          completedAt: new Date(item.completedAt),
        },
      }),
    ),
  );

  return NextResponse.json({
    success: true,
    upserted: parsed.data.items.length,
  });
}
