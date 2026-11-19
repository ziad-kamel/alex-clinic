'use client';

import { useEffect } from 'react';

export function PrintButton() {
  const triggerPrint = () => {
    window.print();
  };

  useEffect(() => {
    // Auto-open print dialog on mount
    const timer = setTimeout(() => {
      window.print();
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="no-print mb-4 flex justify-between items-center bg-slate-100 p-3 rounded-lg border border-slate-300">
      <button
        onClick={() => window.history.back()}
        className="px-4 py-1.5 text-sm font-medium bg-white border border-slate-300 rounded shadow-sm hover:bg-slate-50"
      >
        ← Back / العودة
      </button>
      <button
        onClick={triggerPrint}
        className="px-4 py-1.5 text-sm font-medium bg-teal-600 text-white rounded shadow-sm hover:bg-teal-700"
      >
        Print / طباعة
      </button>
    </div>
  );
}
