import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { PrintButton } from '@/components/PrintButton';

interface LabReceiptData {
  clinicName: string;
  receiptNumber: string;
  orderId: string;
  patientName: string;
  patientPhone: string;
  orderDate: string;
  tests: {
    code: string;
    name: string;
    nameAr?: string;
    unit?: string;
    referenceRange?: string;
  }[];
  portalUrl: string;
  portalUserId: string | null;
  hasExistingAccount: boolean;
}

async function getLabReceipt(id: string): Promise<LabReceiptData | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('staff_token')?.value;

    const res = await fetch(`http://localhost:3001/api/lab-orders/${id}/receipt`, {
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

export default async function LabReceiptPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pwd?: string }>;
}) {
  const { id } = await params;
  const { pwd } = await searchParams;
  const receipt = await getLabReceipt(id);

  if (!receipt) {
    notFound();
  }

  const formattedDate = new Date(receipt.orderDate).toLocaleString('en-US', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="min-h-screen bg-slate-200 py-6 flex flex-col items-center">
      {/* 80mm Print Container */}
      <div className="w-[80mm] max-w-[80mm] bg-white text-black p-4 shadow-md font-mono text-sm leading-tight printable-receipt">
        <PrintButton />

        {/* Receipt Header */}
        <div className="text-center pb-3 border-b border-dashed border-black">
          <h1 className="text-lg font-bold tracking-wider">{receipt.clinicName}</h1>
          <p className="text-xs text-slate-700 mt-0.5">Laboratory Department / قسم التحاليل الطبية</p>
          <div className="mt-2 text-xs font-semibold">{receipt.receiptNumber}</div>
        </div>

        {/* Patient Details */}
        <div className="space-y-1.5 text-xs py-2 border-b border-dashed border-black">
          <div className="flex justify-between">
            <span className="font-bold">Patient / المريض:</span>
            <span className="text-right font-medium">{receipt.patientName}</span>
          </div>

          <div className="flex justify-between">
            <span className="font-bold">Phone / الهاتف:</span>
            <span className="text-right">{receipt.patientPhone}</span>
          </div>

          <div className="flex justify-between text-[11px] text-slate-600">
            <span>Date / التاريخ:</span>
            <span className="text-right">{formattedDate}</span>
          </div>
        </div>

        {/* Test List */}
        <div className="py-2 border-b border-dashed border-black">
          <div className="text-xs font-bold uppercase mb-1">
            Tests / التحاليل المطلوبة:
          </div>
          <ul className="text-xs space-y-1 pl-2">
            {receipt.tests.map((t, idx) => (
              <li key={idx} className="flex justify-between">
                <span>• {t.name}</span>
                {t.nameAr && <span className="text-right text-slate-600">({t.nameAr})</span>}
              </li>
            ))}
          </ul>
        </div>

        {/* Patient Portal Credentials Box */}
        <div className="my-3 py-2 px-2 border-2 border-black rounded text-xs space-y-1.5 bg-slate-50">
          <div className="font-bold text-center uppercase tracking-wide border-b border-black pb-1">
            Online Results / استلام النتائج
          </div>

          <div className="flex justify-between items-center text-[11px]">
            <span className="font-bold">Portal / الرابط:</span>
            <span className="font-semibold text-right">{receipt.portalUrl}</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="font-bold">User ID / الحساب:</span>
            <span className="font-mono font-bold text-sm bg-white px-1.5 py-0.5 border border-slate-300 rounded">
              {receipt.portalUserId || 'N/A'}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="font-bold">Password / كلمة السر:</span>
            {pwd ? (
              <span className="font-mono font-bold text-sm bg-white px-1.5 py-0.5 border border-slate-300 rounded">
                {pwd}
              </span>
            ) : (
              <span className="text-[10px] text-slate-600 italic">
                (Given earlier / تم تسليمها سابقاً)
              </span>
            )}
          </div>

          {pwd && (
            <p className="text-[9px] text-center text-slate-600 pt-1">
              * Keep this password safe. Results will appear once completed.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 text-center text-[11px] text-slate-600 space-y-1">
          <p>النتائج ستكون متاحة على البوابة فور اعتمادها</p>
          <p>Results will be uploaded as soon as verified</p>
          <p className="pt-2 text-[10px]">Alex Clinic / عيادة أليكس</p>
        </div>
      </div>
    </div>
  );
}
