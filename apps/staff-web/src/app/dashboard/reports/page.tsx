'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';

interface DoctorReportDay {
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
}

interface LabReportDay {
  date: string;
  totalOrders: number;
  booked: number;
  inProgress: number;
  completed: number;
  cancelled: number;
  totalTests: number;
}

export default function ReportsDashboardPage() {
  const t = useTranslations('reports');
  const tCommon = useTranslations('common');
  const locale = useLocale();

  const [activeTab, setActiveTab] = useState<'APPOINTMENTS' | 'LAB'>('APPOINTMENTS');

  // Dates: default to last 7 days
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [toDate, setToDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  const [appointmentReports, setAppointmentReports] = useState<DoctorReportDay[]>([]);
  const [labReports, setLabReports] = useState<LabReportDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadReports = async () => {
    setLoading(true);
    setError('');
    try {
      if (activeTab === 'APPOINTMENTS') {
        const res = await fetch(`/api/reports/appointments-per-doctor?from=${fromDate}&to=${toDate}`);
        if (!res.ok) throw new Error('Failed to load appointments report');
        const data = await res.json();
        setAppointmentReports(data);
      } else {
        const res = await fetch(`/api/reports/lab-orders-per-day?from=${fromDate}&to=${toDate}`);
        if (!res.ok) throw new Error('Failed to load lab report');
        const data = await res.json();
        setLabReports(data);
      }
    } catch {
      setError('Network error fetching operational reports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, [activeTab, fromDate, toDate]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('subtitle')}</p>
        </div>

        {/* Date Filter Range */}
        <div className="flex flex-wrap items-center gap-2">
          <div>
            <label className="text-[11px] font-semibold text-slate-500 block">
              {t('fromDate')}
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="px-2.5 py-1 border border-slate-300 rounded text-xs bg-white focus:outline-none focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-500 block">
              {t('toDate')}
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="px-2.5 py-1 border border-slate-300 rounded text-xs bg-white focus:outline-none focus:ring-teal-500"
            />
          </div>

          <button
            onClick={() => loadReports()}
            className="mt-4 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs rounded shadow-xs"
          >
            ↻ {t('refresh')}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 space-x-6 rtl:space-x-reverse text-sm font-medium">
        <button
          onClick={() => setActiveTab('APPOINTMENTS')}
          className={`pb-3 px-1 border-b-2 font-bold transition-colors ${
            activeTab === 'APPOINTMENTS'
              ? 'border-teal-600 text-teal-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          🩺 {t('tabAppointments')}
        </button>
        <button
          onClick={() => setActiveTab('LAB')}
          className={`pb-3 px-1 border-b-2 font-bold transition-colors ${
            activeTab === 'LAB'
              ? 'border-teal-600 text-teal-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          🔬 {t('tabLab')}
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          {error}
        </div>
      )}

      {/* Tab 1: Appointments per Doctor per Day */}
      {activeTab === 'APPOINTMENTS' && (
        <div className="space-y-6">
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500 animate-pulse">
              {tCommon('loading')}
            </div>
          ) : appointmentReports.length === 0 ? (
            <div className="bg-white p-8 text-center border border-slate-200 rounded-lg text-slate-500 text-sm">
              {t('noData')}
            </div>
          ) : (
            appointmentReports.map((day) => (
              <div
                key={day.date}
                className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden"
              >
                <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <span className="font-bold text-sm text-slate-800">
                    📅 {t('date')}: {day.date}
                  </span>
                  <span className="text-xs text-slate-500">
                    {day.doctors.reduce((sum, d) => sum + d.total, 0)} {t('totalAppointments')}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50/50 text-slate-600 font-medium text-xs">
                      <tr>
                        <th className="px-4 py-2.5 text-start">{t('doctor')}</th>
                        <th className="px-4 py-2.5 text-start">{t('specialization')}</th>
                        <th className="px-4 py-2.5 text-start">{t('totalAppointments')}</th>
                        <th className="px-4 py-2.5 text-start">{t('seen')}</th>
                        <th className="px-4 py-2.5 text-start">{t('booked')}</th>
                        <th className="px-4 py-2.5 text-start">{t('cancelled')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {day.doctors.map((doc) => (
                        <tr key={doc.doctorId} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {locale === 'ar' && doc.doctorNameAr ? doc.doctorNameAr : doc.doctorName}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600">
                            {locale === 'ar' && doc.specializationAr
                              ? doc.specializationAr
                              : doc.specialization}
                          </td>
                          <td className="px-4 py-3 font-bold text-teal-800">
                            {doc.total}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            <span className="px-2 py-0.5 rounded font-bold bg-emerald-100 text-emerald-800">
                              {doc.seen}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs">
                            <span className="px-2 py-0.5 rounded font-bold bg-amber-100 text-amber-800">
                              {doc.booked}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs">
                            <span className="px-2 py-0.5 rounded font-bold bg-rose-100 text-rose-800">
                              {doc.cancelled}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 2: Lab Orders per Day */}
      {activeTab === 'LAB' && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500 animate-pulse">
              {tCommon('loading')}
            </div>
          ) : labReports.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">
              {t('noData')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-slate-600 font-medium text-xs">
                  <tr>
                    <th className="px-4 py-3 text-start">{t('date')}</th>
                    <th className="px-4 py-3 text-start">{t('totalOrders')}</th>
                    <th className="px-4 py-3 text-start">{t('totalTests')}</th>
                    <th className="px-4 py-3 text-start">{t('completedOrders')}</th>
                    <th className="px-4 py-3 text-start">{t('inProgressOrders')}</th>
                    <th className="px-4 py-3 text-start">{t('booked')}</th>
                    <th className="px-4 py-3 text-start">{t('cancelled')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {labReports.map((row) => (
                    <tr key={row.date} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-slate-900">
                        {row.date}
                      </td>
                      <td className="px-4 py-3 font-bold text-teal-800">
                        {row.totalOrders}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {row.totalTests}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <span className="px-2 py-0.5 rounded font-bold bg-emerald-100 text-emerald-800">
                          {row.completed}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <span className="px-2 py-0.5 rounded font-bold bg-amber-100 text-amber-800">
                          {row.inProgress}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <span className="px-2 py-0.5 rounded font-bold bg-blue-100 text-blue-800">
                          {row.booked}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <span className="px-2 py-0.5 rounded font-bold bg-rose-100 text-rose-800">
                          {row.cancelled}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
