import { createElement } from 'react';
import path from 'node:path';
import {
  Document,
  Font,
  Page,
  renderToBuffer,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer';
import { NextResponse } from 'next/server';
import { getClinicName } from '@/lib/clinic';
import { prisma } from '@/lib/db';
import { getClinicTimeZone, getPatientResults } from '@/lib/results';
import { getPortalSession } from '@/lib/session';
import { z } from 'zod';

Font.register({
  family: 'Noto Sans Arabic',
  fonts: [
    {
      src: path.join(
        process.cwd(),
        'public',
        'fonts',
        'NotoSansArabic-Regular.ttf',
      ),
      fontWeight: 400,
    },
    {
      src: path.join(
        process.cwd(),
        'public',
        'fonts',
        'NotoSansArabic-Bold.ttf',
      ),
      fontWeight: 700,
    },
  ],
});

const translations = {
  en: {
    clinic: getClinicName('en', 'Alex Clinic'),
    title: 'Laboratory Results Report',
    patient: 'Patient',
    order: 'Order',
    completed: 'Completed',
    test: 'Test',
    result: 'Result',
    unit: 'Unit',
    referenceRange: 'Reference range',
    flag: 'Flag',
    normal: 'Normal',
    high: 'High',
    low: 'Low',
  },
  ar: {
    clinic: 'عيادة أليكس',
    title: 'تقرير نتائج التحاليل',
    patient: 'المريض',
    order: 'الطلب',
    completed: 'تاريخ الاكتمال',
    test: 'التحليل',
    result: 'النتيجة',
    unit: 'الوحدة',
    referenceRange: 'المعدل المرجعي',
    flag: 'التقييم',
    normal: 'طبيعي',
    high: 'مرتفع',
    low: 'منخفض',
  },
} as const;

const styles = StyleSheet.create({
  page: {
    padding: 42,
    fontSize: 10,
    fontFamily: 'Noto Sans Arabic',
    color: '#0f172a',
  },
  rtl: { direction: 'rtl', textAlign: 'right' },
  clinic: {
    textAlign: 'center',
    fontSize: 12,
    color: '#0f766e',
    marginBottom: 8,
  },
  title: { textAlign: 'center', fontSize: 18, marginBottom: 24 },
  details: { marginBottom: 20, lineHeight: 1.8 },
  label: { color: '#64748b' },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    padding: 8,
    borderBottomWidth: 1,
    borderColor: '#cbd5e1',
  },
  tableRow: {
    flexDirection: 'row',
    padding: 8,
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
  },
  cell: { flex: 1, paddingHorizontal: 3 },
  test: { flex: 1.5, paddingHorizontal: 3 },
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderRef: string }> },
) {
  const session = await getPortalSession();
  if (!session) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const { orderRef } = await params;
  if (!z.string().uuid().safeParse(orderRef).success) {
    return NextResponse.json(
      { message: 'Result report not found' },
      { status: 404 },
    );
  }
  const locale =
    new URL(request.url).searchParams.get('locale') === 'ar' ? 'ar' : 'en';
  const message = translations[locale];

  const account = await prisma.portalAccount.findUnique({
    where: { patientRef: session.patientRef },
    select: { patientName: true, mustChangePassword: true },
  });
  if (!account) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  if (account.mustChangePassword) {
    return NextResponse.json(
      { message: 'Password change required' },
      { status: 403 },
    );
  }

  const items = await getPatientResults(session.patientRef, {
    orderRef,
    orderBy: { testName: 'asc' },
  });
  if (items.length === 0) {
    return NextResponse.json(
      { message: 'Result report not found' },
      { status: 404 },
    );
  }

  const completedAt = items.reduce(
    (latest, item) => (item.completedAt > latest ? item.completedAt : latest),
    items[0].completedAt,
  );
  const date = new Intl.DateTimeFormat(
    locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US',
    { dateStyle: 'long', timeZone: getClinicTimeZone() },
  ).format(completedAt);

  const document = createElement(
    Document,
    null,
    createElement(
      Page,
      {
        size: 'A4',
        style: locale === 'ar' ? [styles.page, styles.rtl] : styles.page,
      },
      createElement(Text, { style: styles.clinic }, message.clinic),
      createElement(Text, { style: styles.title }, message.title),
      createElement(
        View,
        { style: styles.details },
        createElement(Text, null, `${message.patient}: ${account.patientName}`),
        createElement(Text, null, `${message.order}: ${orderRef}`),
        createElement(Text, null, `${message.completed}: ${date}`),
      ),
      createElement(
        View,
        { style: styles.tableHeader },
        createElement(Text, { style: styles.test }, message.test),
        createElement(Text, { style: styles.cell }, message.result),
        createElement(Text, { style: styles.cell }, message.unit),
        createElement(Text, { style: styles.cell }, message.referenceRange),
        createElement(Text, { style: styles.cell }, message.flag),
      ),
      ...items.map((item) =>
        createElement(
          View,
          { key: item.id, style: styles.tableRow },
          createElement(
            Text,
            { style: styles.test },
            locale === 'ar' && item.testNameAr
              ? item.testNameAr
              : item.testName,
          ),
          createElement(Text, { style: styles.cell }, item.value),
          createElement(Text, { style: styles.cell }, item.unit ?? '—'),
          createElement(
            Text,
            { style: styles.cell },
            item.referenceRange ?? '—',
          ),
          createElement(
            Text,
            { style: styles.cell },
            item.flag === 'NORMAL'
              ? message.normal
              : item.flag === 'HIGH'
                ? message.high
                : item.flag === 'LOW'
                  ? message.low
                  : '—',
          ),
        ),
      ),
    ),
  );
  const pdf = await renderToBuffer(document);

  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="results-${orderRef}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
