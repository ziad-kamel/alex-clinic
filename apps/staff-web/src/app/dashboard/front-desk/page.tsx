'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import Link from 'next/link';

interface Doctor {
  id: string;
  name: string;
  nameAr?: string;
  specialization: { name: string; nameAr?: string };
  schedules: { weekday: number; startTime: string; endTime: string; maxPatients?: number }[];
}

interface Patient {
  id: string;
  name: string;
  phone: string;
  extraPhone?: string;
}

interface Appointment {
  id: string;
  queueNumber: number;
  appointmentDate: string;
  status: string;
  patient: { name: string; phone: string };
  doctor: { name: string; nameAr?: string; specialization: { name: string; nameAr?: string } };
}

export default function FrontDeskPage() {
  const t = useTranslations('frontDesk');
  const tCommon = useTranslations('common');
  const locale = useLocale();

  // Search & Register State
  const [searchQuery, setSearchQuery] = useState('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  // New Patient Form State
  const [showNewPatient, setShowNewPatient] = useState(false);
  const [patientName, setPatientName] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [patientExtraPhone, setPatientExtraPhone] = useState('');

  // Booking State
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [appointmentDate, setAppointmentDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [bookingResult, setBookingResult] = useState<any | null>(null);
  const [bookingError, setBookingError] = useState('');
  const [loading, setLoading] = useState(false);

  // Today's Appointments
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [doctorFilter, setDoctorFilter] = useState('');

  // Fetch doctors and today's appointments on load
  useEffect(() => {
    fetch('/api/doctors')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        setDoctors(data);
        if (data.length > 0) setSelectedDoctorId(data[0].id);
      })
      .catch(() => {});

    loadTodayAppointments();
  }, []);

  const loadTodayAppointments = (docId?: string) => {
    const today = new Date().toISOString().split('T')[0];
    const url = `/api/appointments?date=${today}${docId ? `&doctorId=${docId}` : ''}`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setAppointments(data))
      .catch(() => {});
  };

  // Search patients
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      const res = await fetch(`/api/patients?query=${encodeURIComponent(searchQuery)}`);
      if (res.ok) {
        const data = await res.json();
        setPatients(data);
      }
    } catch {}
  };

  // Register patient
  const handleRegisterPatient = async (e: React.FormEvent) => {
    e.preventDefault();
    setBookingError('');
    try {
      const res = await fetch('/api/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: patientName,
          phone: patientPhone,
          extraPhone: patientExtraPhone || undefined,
        }),
      });

      if (!res.ok) {
        setBookingError('Failed to register patient');
        return;
      }

      const newPatient = await res.json();
      setSelectedPatient(newPatient);
      setShowNewPatient(false);
      setPatientName('');
      setPatientPhone('');
      setPatientExtraPhone('');
    } catch {
      setBookingError('Error creating patient');
    }
  };

  // Book appointment
  const handleBookAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) {
      setBookingError('Please select or register a patient first');
      return;
    }

    setBookingError('');
    setBookingResult(null);
    setLoading(true);

    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: selectedPatient.id,
          doctorId: selectedDoctorId,
          appointmentDate,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setBookingError(data.message || 'Failed to book appointment');
        setLoading(false);
        return;
      }

      setBookingResult(data);
      loadTodayAppointments(doctorFilter);
      setLoading(false);
    } catch {
      setBookingError('Network error booking appointment');
      setLoading(false);
    }
  };

  // Cancel appointment
  const handleCancel = async (id: string) => {
    if (!window.confirm(t('cancelConfirm'))) return;

    try {
      const res = await fetch(`/api/appointments/${id}/cancel`, {
        method: 'PATCH',
      });
      if (res.ok) {
        loadTodayAppointments(doctorFilter);
      }
    } catch {}
  };

  const selectedDoctor = doctors.find((d) => d.id === selectedDoctorId);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
        <p className="text-sm text-slate-500 mt-1">
          Patient registration, appointment booking, and 80mm receipts
        </p>
      </div>

      {/* Grid: Patient Selection & Booking Form */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column: Patient Search & Register */}
        <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-slate-800">
              {t('searchPatientTitle')}
            </h2>
            <button
              onClick={() => {
                setShowNewPatient(!showNewPatient);
                setSelectedPatient(null);
              }}
              className="text-xs px-3 py-1.5 font-medium rounded-md bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100"
            >
              {showNewPatient ? tCommon('search') : `+ ${t('registerPatientTitle')}`}
            </button>
          </div>

          {!showNewPatient ? (
            <div>
              <form onSubmit={handleSearch} className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('searchPlaceholder')}
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-teal-500 focus:border-teal-500"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-slate-800 text-white rounded-md text-sm hover:bg-slate-700"
                >
                  {tCommon('search')}
                </button>
              </form>

              {/* Patient List */}
              <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-md">
                {patients.length === 0 ? (
                  <p className="p-4 text-xs text-slate-500 text-center">
                    {searchQuery ? t('noPatientsFound') : 'Search patients above to begin'}
                  </p>
                ) : (
                  patients.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => setSelectedPatient(p)}
                      className={`p-3 cursor-pointer text-sm flex justify-between items-center hover:bg-teal-50 transition-colors ${
                        selectedPatient?.id === p.id ? 'bg-teal-100 font-semibold text-teal-900' : ''
                      }`}
                    >
                      <div>
                        <div>{p.name}</div>
                        <div className="text-xs text-slate-500">{p.phone}</div>
                      </div>
                      {selectedPatient?.id === p.id && (
                        <span className="text-xs text-teal-700 font-bold">✓ Selected</span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            /* Register New Patient Form */
            <form onSubmit={handleRegisterPatient} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t('fullName')} *
                </label>
                <input
                  type="text"
                  required
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t('phone')} *
                </label>
                <input
                  type="text"
                  required
                  value={patientPhone}
                  onChange={(e) => setPatientPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t('extraPhone')}
                </label>
                <input
                  type="text"
                  value={patientExtraPhone}
                  onChange={(e) => setPatientExtraPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-teal-500"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2 bg-teal-600 text-white rounded-md text-sm font-medium hover:bg-teal-700"
              >
                {t('registerBtn')}
              </button>
            </form>
          )}

          {/* Selected Patient Banner */}
          {selectedPatient && (
            <div className="mt-4 p-3 bg-teal-50 border border-teal-200 rounded-md flex justify-between items-center text-sm">
              <div>
                <span className="text-xs text-teal-800 font-medium">Selected Patient: </span>
                <strong>{selectedPatient.name}</strong> ({selectedPatient.phone})
              </div>
              <button
                onClick={() => setSelectedPatient(null)}
                className="text-xs text-slate-500 hover:text-red-600"
              >
                Clear
              </button>
            </div>
          )}
        </div>

        {/* Right Column: Appointment Booking */}
        <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-800 mb-4">
            {t('bookAppointmentTitle')}
          </h2>

          <form onSubmit={handleBookAppointment} className="space-y-4">
            {bookingError && (
              <div className="p-3 text-xs bg-red-100 text-red-700 border border-red-200 rounded-md">
                {bookingError}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {t('selectDoctor')} *
              </label>
              <select
                value={selectedDoctorId}
                onChange={(e) => setSelectedDoctorId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-teal-500"
              >
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {locale === 'ar' && d.nameAr ? d.nameAr : d.name} (
                    {locale === 'ar' && d.specialization.nameAr
                      ? d.specialization.nameAr
                      : d.specialization.name}
                    )
                  </option>
                ))}
              </select>

              {/* Working days schedule hint */}
              {selectedDoctor && (
                <div className="mt-1 text-[11px] text-slate-500">
                  {t('workingDays')}:{' '}
                  {selectedDoctor.schedules.length === 0
                    ? 'No schedule'
                    : selectedDoctor.schedules
                        .map((s) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][s.weekday])
                        .join(', ')}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {t('selectDate')} *
              </label>
              <input
                type="date"
                required
                value={appointmentDate}
                onChange={(e) => setAppointmentDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-teal-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !selectedPatient}
              className="w-full py-2 bg-teal-600 text-white rounded-md text-sm font-medium hover:bg-teal-700 disabled:opacity-50"
            >
              {loading ? tCommon('loading') : t('bookBtn')}
            </button>
          </form>

          {/* Booking Success Banner & Print Link */}
          {bookingResult && (
            <div className="mt-6 p-4 bg-teal-50 border border-teal-300 rounded-lg text-center">
              <div className="text-teal-800 font-bold mb-1">{t('bookingSuccess')}</div>
              <div className="text-3xl font-extrabold text-teal-900 my-2">
                #{bookingResult.queueNumber}
              </div>
              <div className="text-xs text-slate-600 mb-3">
                {t('sessionStarts')}: <strong>{bookingResult.sessionStartTime}</strong>
              </div>
              <Link
                href={`/print/appointment/${bookingResult.id}`}
                target="_blank"
                className="inline-block px-4 py-2 bg-teal-700 text-white text-xs font-bold rounded shadow hover:bg-teal-800"
              >
                🖨️ {tCommon('print')} (80mm)
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Today's Appointments Table */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-4">
          <h2 className="text-lg font-bold text-slate-800">
            {t('todayAppointments')}
          </h2>

          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-600">
              {t('filterByDoctor')}:
            </label>
            <select
              value={doctorFilter}
              onChange={(e) => {
                setDoctorFilter(e.target.value);
                loadTodayAppointments(e.target.value);
              }}
              className="px-3 py-1.5 border border-slate-300 rounded-md text-xs focus:outline-none focus:ring-teal-500"
            >
              <option value="">{tCommon('all')}</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {locale === 'ar' && d.nameAr ? d.nameAr : d.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-slate-600 font-medium text-xs">
              <tr>
                <th className="px-4 py-3 text-start"># {tCommon('status')}</th>
                <th className="px-4 py-3 text-start">{t('fullName')}</th>
                <th className="px-4 py-3 text-start">{t('phone')}</th>
                <th className="px-4 py-3 text-start">{t('selectDoctor')}</th>
                <th className="px-4 py-3 text-end">{tCommon('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {appointments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-xs text-slate-500">
                    {t('noAppointments')}
                  </td>
                </tr>
              ) : (
                appointments.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-bold text-slate-900">
                      <span className="inline-block px-2 py-0.5 bg-slate-100 rounded mr-2 rtl:mr-0 rtl:ml-2">
                        #{a.queueNumber}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          a.status === 'BOOKED'
                            ? 'bg-blue-100 text-blue-800'
                            : a.status === 'SEEN'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {a.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {a.patient.name}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{a.patient.phone}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {locale === 'ar' && a.doctor.nameAr ? a.doctor.nameAr : a.doctor.name}
                    </td>
                    <td className="px-4 py-3 text-end space-x-2 rtl:space-x-reverse">
                      <Link
                        href={`/print/appointment/${a.id}`}
                        target="_blank"
                        className="text-xs px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded font-medium inline-block"
                      >
                        🖨️ {tCommon('reprint')}
                      </Link>
                      {a.status === 'BOOKED' && (
                        <button
                          onClick={() => handleCancel(a.id)}
                          className="text-xs px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 rounded font-medium"
                        >
                          {tCommon('cancel')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
