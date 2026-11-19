import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { PrintButton } from '@/components/PrintButton';

interface OrderDetail {
  id: string;
  status: string;
  createdAt: string;
  completedAt?: string;
  patient: {
    id: string;
    name: string;
    phone: string;
    portalAccountLocal?: {
      portalUserId: string;
    };
  };
  items: {
    id: string;
    resultValue?: string;
    flag?: 'NORMAL' | 'HIGH' | 'LOW';
    enteredBy?: string;
    enteredAt?: string;
    test: {
      id: string;
      code: string;
      name: string;
      nameAr?: string;
      unit?: string;
      referenceRange?: string;
    };
  }[];
}

async function getOrder(id: string): Promise<OrderDetail | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('staff_token')?.value;

    const res = await fetch(`http://localhost:3001/api/lab-orders/${id}`, {
      headers: {
        ...(token ? { Cookie: `staff_token=${token}` } : {}),
      },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function LabResultsPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = await getOrder(id);

  if (!order) {
    notFound();
  }

  const orderDate = new Date(order.createdAt).toLocaleDateString('en-US', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const completionDate = order.completedAt
    ? new Date(order.completedAt).toLocaleString('en-US', {
        timeZone: 'Africa/Cairo',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Pending / قيد التنفيذ';

  const reportNo = `LAB-${order.id.substring(0, 8).toUpperCase()}`;

  return (
    <div className="min-h-screen bg-slate-100 py-6 flex flex-col items-center">
      {/* Print Page Styles to format as clean A4 document */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 15mm;
          }
          body {
            background-color: white !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .printable-report {
            width: 100% !important;
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: none !important;
          }
        }
      `}</style>

      {/* A4 Container */}
      <div className="w-full max-w-[210mm] bg-white text-slate-900 p-8 shadow-md rounded-lg printable-report font-sans">
        <PrintButton />

        {/* Clinic / Lab Header */}
        <div className="border-b-2 border-teal-700 pb-4 mb-6 flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-teal-800 tracking-tight">
              Alex Clinic / عيادة أليكس
            </h1>
            <p className="text-sm font-semibold text-slate-700 mt-0.5">
              Laboratory Medicine & Diagnostics / قسم التحاليل الطبية والمخبرية
            </p>
            <p className="text-xs text-slate-500">
              Licensed Clinical Diagnostic Center • Cairo, Egypt
            </p>
          </div>
          <div className="text-right">
            <div className="inline-block px-3 py-1 bg-teal-50 border border-teal-200 text-teal-800 text-xs font-bold rounded">
              {order.status === 'COMPLETED' ? 'FINAL REPORT / تقرير معتمد' : 'PRELIMINARY / تقرير أولي'}
            </div>
            <div className="text-xs font-mono font-bold text-slate-700 mt-1.5">
              {reportNo}
            </div>
          </div>
        </div>

        {/* Patient Demographics & Report Metadata Box */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-6 grid grid-cols-2 gap-4 text-xs">
          <div className="space-y-1.5">
            <div className="flex">
              <span className="w-32 font-bold text-slate-600">Patient / المريض:</span>
              <span className="font-bold text-slate-900">{order.patient.name}</span>
            </div>
            <div className="flex">
              <span className="w-32 font-bold text-slate-600">Phone / الهاتف:</span>
              <span className="text-slate-800">{order.patient.phone}</span>
            </div>
            <div className="flex">
              <span className="w-32 font-bold text-slate-600">Portal ID / كود البوابة:</span>
              <span className="font-mono font-bold text-teal-800">
                {order.patient.portalAccountLocal?.portalUserId || 'N/A'}
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex">
              <span className="w-36 font-bold text-slate-600">Order Date / تاريخ الطلب:</span>
              <span className="text-slate-800">{orderDate}</span>
            </div>
            <div className="flex">
              <span className="w-36 font-bold text-slate-600">Verified / تاريخ الاعتماد:</span>
              <span className="text-slate-800 font-medium">{completionDate}</span>
            </div>
            <div className="flex">
              <span className="w-36 font-bold text-slate-600">Status / الحالة:</span>
              <span
                className={`font-bold ${
                  order.status === 'COMPLETED' ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                {order.status}
              </span>
            </div>
          </div>
        </div>

        {/* Test Results Table */}
        <div className="mb-8">
          <table className="w-full text-left text-xs border border-slate-300 border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 border-b border-slate-300">
                <th className="py-2.5 px-3 font-bold border-r border-slate-300">
                  Test Name / اسم الفحص
                </th>
                <th className="py-2.5 px-3 font-bold text-center border-r border-slate-300 w-28">
                  Result / النتيجة
                </th>
                <th className="py-2.5 px-3 font-bold text-center border-r border-slate-300 w-20">
                  Unit / الوحدة
                </th>
                <th className="py-2.5 px-3 font-bold text-center border-r border-slate-300 w-36">
                  Reference Range / المعدل الطبيعي
                </th>
                <th className="py-2.5 px-3 font-bold text-center w-24">
                  Flag / التقييم
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {order.items.map((item) => {
                const isHigh = item.flag === 'HIGH';
                const isLow = item.flag === 'LOW';

                return (
                  <tr key={item.id} className="hover:bg-slate-50">
                    {/* Test Name */}
                    <td className="py-2.5 px-3 border-r border-slate-200">
                      <div className="font-bold text-slate-900">{item.test.name}</div>
                      {item.test.nameAr && (
                        <div className="text-[11px] text-slate-500">{item.test.nameAr}</div>
                      )}
                    </td>

                    {/* Result Value */}
                    <td
                      className={`py-2.5 px-3 text-center border-r border-slate-200 font-mono font-extrabold text-sm ${
                        isHigh ? 'text-rose-700' : isLow ? 'text-amber-700' : 'text-slate-900'
                      }`}
                    >
                      {item.resultValue || '—'}
                    </td>

                    {/* Unit */}
                    <td className="py-2.5 px-3 text-center border-r border-slate-200 text-slate-600">
                      {item.test.unit || '—'}
                    </td>

                    {/* Reference Range */}
                    <td className="py-2.5 px-3 text-center border-r border-slate-200 font-mono text-slate-600">
                      {item.test.referenceRange || '—'}
                    </td>

                    {/* Flag */}
                    <td className="py-2.5 px-3 text-center">
                      {item.flag === 'NORMAL' && (
                        <span className="px-2 py-0.5 text-[10px] font-bold text-emerald-800 bg-emerald-50 rounded">
                          NORMAL
                        </span>
                      )}
                      {item.flag === 'HIGH' && (
                        <span className="px-2 py-0.5 text-[10px] font-bold text-rose-800 bg-rose-100 rounded">
                          ▲ HIGH
                        </span>
                      )}
                      {item.flag === 'LOW' && (
                        <span className="px-2 py-0.5 text-[10px] font-bold text-amber-800 bg-amber-100 rounded">
                          ▼ LOW
                        </span>
                      )}
                      {!item.flag && <span className="text-slate-400">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Doctor & Lab Verification Sign-off */}
        <div className="border-t border-slate-200 pt-6 mt-8 flex justify-between items-end text-xs text-slate-600">
          <div className="space-y-1">
            <div className="font-semibold text-slate-800">
              Alex Clinic Electronic Verification
            </div>
            <div>
              Online Portal: <span className="font-mono text-teal-800">http://localhost:3002</span>
            </div>
            <div className="text-[11px] text-slate-500">
              * This is an electronically verified report printed from Alex Clinic Medical System.
            </div>
          </div>

          <div className="text-center w-48">
            <div className="border-b border-slate-400 pb-8 mb-1"></div>
            <div className="font-bold text-slate-800">Medical Technologist</div>
            <div className="text-[11px] text-slate-500">Clinical Pathology Dept.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
