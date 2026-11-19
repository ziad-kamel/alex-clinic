import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { PrintButton } from '@/components/PrintButton';

interface ReceiptData {
  clinicName: string;
  receiptNumber: string;
  patientName: string;
  patientPhone: string;
  doctorName: string;
  doctorNameAr?: string;
  specialization: string;
  specializationAr?: string;
  reservedAt: string;
  appointmentDate: string;
  queueNumber: number;
  sessionStartTime: string;
}

async function getReceipt(id: string): Promise<ReceiptData | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('staff_token')?.value;

    const res = await fetch(`http://localhost:3001/api/appointments/${id}/receipt`, {
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

export default async function AppointmentPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const receipt = await getReceipt(id);

  if (!receipt) {
    notFound();
  }

  const reservedDate = new Date(receipt.reservedAt).toLocaleString('en-US', {
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
          <p className="text-xs text-slate-700 mt-0.5">Alex Clinic / عيادة أليكس</p>
          <div className="mt-2 text-xs font-semibold">{receipt.receiptNumber}</div>
        </div>

        {/* Queue Highlight Box */}
        <div className="my-3 py-2 px-1 text-center border-2 border-black rounded">
          <div className="text-xs font-bold uppercase">Queue Number / رقم الدور</div>
          <div className="text-4xl font-extrabold my-1">{receipt.queueNumber}</div>
          <div className="text-xs text-slate-800">
            Session Starts / يبدأ الكشف: <strong>{receipt.sessionStartTime}</strong>
          </div>
        </div>

        {/* Appointment Details Table */}
        <div className="space-y-2 text-xs py-2 border-b border-dashed border-black">
          <div className="flex justify-between">
            <span className="font-bold">Patient / المريض:</span>
            <span className="text-right font-medium">{receipt.patientName}</span>
          </div>

          <div className="flex justify-between">
            <span className="font-bold">Phone / الهاتف:</span>
            <span className="text-right">{receipt.patientPhone}</span>
          </div>

          <div className="flex justify-between">
            <span className="font-bold">Doctor / الطبيب:</span>
            <span className="text-right font-medium">
              {receipt.doctorName}
              {receipt.doctorNameAr ? ` / ${receipt.doctorNameAr}` : ''}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="font-bold">Specialty / التخصص:</span>
            <span className="text-right">
              {receipt.specialization}
              {receipt.specializationAr ? ` / ${receipt.specializationAr}` : ''}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="font-bold">Date / تاريخ الكشف:</span>
            <span className="text-right font-semibold">{receipt.appointmentDate}</span>
          </div>

          <div className="flex justify-between text-[11px] text-slate-600">
            <span>Booked / حجز في:</span>
            <span className="text-right">{reservedDate}</span>
          </div>
        </div>

        {/* Receipt Footer */}
        <div className="mt-4 text-center text-[11px] text-slate-600 space-y-1">
          <p>يرجى التواجد في العيادة قبل بدء الموعد</p>
          <p>Please arrive before doctor session starts</p>
          <p className="pt-2 text-[10px]">Thank you / شكراً لزيارتكم</p>
        </div>
      </div>
    </div>
  );
}
