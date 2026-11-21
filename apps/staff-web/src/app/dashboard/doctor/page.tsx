'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';

interface QueueItem {
  id: string;
  queueNumber: number;
  appointmentDate: string;
  reservedAt: string;
  status: 'BOOKED' | 'SEEN' | 'CANCELLED';
  patient: {
    id: string;
    name: string;
    phone: string;
  };
}

interface Doctor {
  id: string;
  name: string;
  nameAr?: string | null;
  specialization?: {
    name: string;
    nameAr?: string | null;
  };
}

export default function DoctorQueuePage() {
  const t = useTranslations('doctor');
  const tCommon = useTranslations('common');
  const locale = useLocale();

  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  // User and Doctor metadata
  const [currentUser, setCurrentUser] = useState<{ id: string; role: string; name: string; doctorId?: string } | null>(null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.user) {
          setCurrentUser(data.user);
          if (data.user.role === 'ADMIN') {
            fetch('/api/doctors')
              .then((r) => (r.ok ? r.json() : []))
              .then((docs: Doctor[]) => {
                setDoctors(docs);
                if (docs.length > 0) {
                  setSelectedDoctorId(docs[0].id);
                }
              })
              .catch(() => {});
          }
        }
      })
      .catch(() => {});
  }, []);

  const loadQueue = async (selectedDate = date, docId = selectedDoctorId) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (selectedDate) params.append('date', selectedDate);
      if (currentUser?.role === 'ADMIN' && docId) {
        params.append('doctorId', docId);
      }

      const res = await fetch(`/api/doctor/queue?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.message || 'Failed to load queue');
        return;
      }
      const data: QueueItem[] = await res.json();
      setQueue(data);
    } catch {
      setError('Network error loading doctor queue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      loadQueue(date, selectedDoctorId);
    }
  }, [date, selectedDoctorId, currentUser]);

  const handleMarkAsSeen = async (id: string) => {
    setProcessingId(id);
    setActionSuccess('');
    setError('');
    try {
      const res = await fetch(`/api/appointments/${id}/seen`, {
        method: 'PATCH',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.message || 'Failed to update appointment status');
        return;
      }
      setActionSuccess(t('markedSeenSuccess'));
      await loadQueue(date);
    } catch {
      setError('Network error marking appointment as seen');
    } finally {
      setProcessingId(null);
    }
  };

  const totalCount = queue.length;
  const waitingCount = queue.filter((item) => item.status === 'BOOKED').length;
  const seenCount = queue.filter((item) => item.status === 'SEEN').length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('subtitle')}</p>
        </div>

        {/* Controls: Doctor Selector (Admin) + Date Selector */}
        <div className="flex flex-wrap items-center gap-3">
          {currentUser?.role === 'ADMIN' && doctors.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-600">
                Doctor / الطبيب:
              </label>
              <select
                value={selectedDoctorId}
                onChange={(e) => setSelectedDoctorId(e.target.value)}
                className="px-2.5 py-1.5 border border-slate-300 rounded-md text-xs bg-white font-semibold text-slate-800 focus:outline-none focus:ring-teal-500"
              >
                {doctors.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {locale === 'ar' && doc.nameAr ? doc.nameAr : doc.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {currentUser?.role === 'DOCTOR' && (
            <span className="text-xs px-2.5 py-1 rounded bg-teal-50 border border-teal-200 text-teal-800 font-bold">
              👨‍⚕️ {currentUser.name}
            </span>
          )}

          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-600">
              {t('selectDate')}:
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded-md text-xs bg-white focus:outline-none focus:ring-teal-500"
            />
            <button
              onClick={() => setDate(new Date().toISOString().split('T')[0])}
              className="text-xs px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded"
            >
              {tCommon('today')}
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase">
            {t('totalPatients')}
          </span>
          <div className="text-2xl font-bold text-slate-900 mt-1">{totalCount}</div>
        </div>

        <div className="bg-amber-50 p-4 rounded-lg border border-amber-200 shadow-xs">
          <span className="text-xs font-semibold text-amber-800 uppercase">
            {t('waitingCount')}
          </span>
          <div className="text-2xl font-bold text-amber-900 mt-1">{waitingCount}</div>
        </div>

        <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-200 shadow-xs">
          <span className="text-xs font-semibold text-emerald-800 uppercase">
            {t('seenCount')}
          </span>
          <div className="text-2xl font-bold text-emerald-900 mt-1">{seenCount}</div>
        </div>
      </div>

      {/* Feedback Alerts */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          {error}
        </div>
      )}

      {actionSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg font-medium">
          {actionSuccess}
        </div>
      )}

      {/* Queue Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800">
            {t('todayQueue')} — {date}
          </h2>
          <button
            onClick={() => loadQueue(date)}
            className="text-xs text-teal-600 hover:text-teal-800 font-semibold"
          >
            ↻ {tCommon('loading') === 'Loading...' ? 'Refresh' : 'تحديث'}
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500 animate-pulse">
            {tCommon('loading')}
          </div>
        ) : queue.length === 0 ? (
          <div className="p-10 text-center">
            <span className="text-3xl">📋</span>
            <p className="mt-2 text-sm font-semibold text-slate-600">
              {t('emptyQueue')}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-slate-600 font-medium text-xs">
                <tr>
                  <th className="px-4 py-3 text-start">{t('queueNumber')}</th>
                  <th className="px-4 py-3 text-start">{t('patientName')}</th>
                  <th className="px-4 py-3 text-start">{t('patientPhone')}</th>
                  <th className="px-4 py-3 text-start">{t('reservedAt')}</th>
                  <th className="px-4 py-3 text-start">{t('status')}</th>
                  <th className="px-4 py-3 text-end">{t('actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {queue.map((item) => {
                  const isProcessing = processingId === item.id;
                  const bookingTime = new Date(item.reservedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-50 transition-colors ${
                        item.status === 'SEEN' ? 'bg-slate-50/60 opacity-80' : ''
                      }`}
                    >
                      {/* Queue Number */}
                      <td className="px-4 py-3 font-mono font-bold text-base text-teal-800">
                        #{item.queueNumber}
                      </td>

                      {/* Patient Name */}
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {item.patient.name}
                      </td>

                      {/* Phone */}
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {item.patient.phone}
                      </td>

                      {/* Booking Time */}
                      <td className="px-4 py-3 text-xs text-slate-500 font-mono">
                        {bookingTime}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${
                            item.status === 'SEEN'
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                              : item.status === 'CANCELLED'
                              ? 'bg-rose-100 text-rose-800 border-rose-200'
                              : 'bg-amber-100 text-amber-800 border-amber-200'
                          }`}
                        >
                          {item.status === 'SEEN'
                            ? t('statusSeen')
                            : item.status === 'CANCELLED'
                            ? t('statusCancelled')
                            : t('statusBooked')}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-end">
                        {item.status === 'BOOKED' ? (
                          <button
                            onClick={() => handleMarkAsSeen(item.id)}
                            disabled={isProcessing}
                            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded shadow-xs disabled:opacity-50 inline-flex items-center gap-1"
                          >
                            {isProcessing ? tCommon('loading') : `✓ ${t('markAsSeen')}`}
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400 font-medium">
                            {item.status === 'SEEN' ? '✓ ' + t('statusSeen') : '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
