'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import Link from 'next/link';

interface Specialization {
  id: string;
  name: string;
  nameAr?: string;
}

interface Doctor {
  id: string;
  name: string;
  nameAr?: string;
  specializationId: string;
  specialization: { id: string; name: string; nameAr?: string };
  schedules: { weekday: number; startTime: string; endTime: string; maxPatients?: number }[];
}

interface Patient {
  id: string;
  name: string;
  phone: string;
  extraPhone?: string;
  portalAccountLocal?: {
    portalUserId: string;
  };
}

interface Appointment {
  id: string;
  queueNumber: number;
  appointmentDate: string;
  status: string;
  bookingSource: 'FRONT_DESK' | 'ONLINE';
  patient: { name: string; phone: string };
  doctor: { name: string; nameAr?: string; specialization: { name: string; nameAr?: string } };
}

function clinicTodayDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.NEXT_PUBLIC_CLINIC_TIMEZONE || 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    numberingSystem: 'latn',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

interface LabTest {
  id: string;
  code: string;
  name: string;
  nameAr?: string;
  unit?: string;
  referenceRange?: string;
}

export default function FrontDeskPage() {
  const t = useTranslations('frontDesk');
  const tLab = useTranslations('lab');
  const tCommon = useTranslations('common');
  const locale = useLocale();

  // Current user role
  const [currentUser, setCurrentUser] = useState<{ id: string; role: string; name: string } | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.user) setCurrentUser(data.user);
      })
      .catch(() => {});
  }, []);

  const isLabUser = currentUser?.role === 'LAB';

  // Active Booking Tab: 'APPOINTMENT' | 'LAB'
  const [activeTab, setActiveTab] = useState<'APPOINTMENT' | 'LAB'>('APPOINTMENT');

  // If LAB user, force to LAB tab
  useEffect(() => {
    if (isLabUser) setActiveTab('LAB');
  }, [isLabUser]);

  // Patients Search & Filter State
  const [searchName, setSearchName] = useState('');
  const [searchPhone, setSearchPhone] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // AbortController ref to cancel previous in-flight search requests
  const abortControllerRef = useRef<AbortController | null>(null);

  // New Patient Form State
  const [showNewPatient, setShowNewPatient] = useState(false);
  const [patientName, setPatientName] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [patientExtraPhone, setPatientExtraPhone] = useState('');

  // Doctor & Specialization Filters
  const [specializations, setSpecializations] = useState<Specialization[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [selectedSpecFilter, setSelectedSpecFilter] = useState('');
  const [doctorNameQuery, setDoctorNameQuery] = useState('');
  const [selectedDoctorId, setSelectedDoctorId] = useState('');

  // Appointment Booking State
  const [appointmentDate, setAppointmentDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [bookingResult, setBookingResult] = useState<any | null>(null);
  const [bookingError, setBookingError] = useState('');
  const [loading, setLoading] = useState(false);

  // Lab Tests Catalog & Booking State
  const [labCatalog, setLabCatalog] = useState<LabTest[]>([]);
  const [selectedTestIds, setSelectedTestIds] = useState<string[]>([]);
  const [labSearchQuery, setLabSearchQuery] = useState('');
  const [labBookingLoading, setLabBookingLoading] = useState(false);
  const [labBookingError, setLabBookingError] = useState('');
  const [labBookingResult, setLabBookingResult] = useState<any | null>(null);

  // Credential Reissue State
  const [reissuing, setReissuing] = useState(false);
  const [reissuedCredentials, setReissuedCredentials] = useState<{
    portalUserId: string;
    plainPassword: string;
  } | null>(null);

  // Today's Appointments
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [doctorFilter, setDoctorFilter] = useState('');

  // Fetch initial metadata
  useEffect(() => {
    // Doctors
    fetch('/api/doctors')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        setDoctors(data);
        if (data.length > 0) setSelectedDoctorId(data[0].id);
      })
      .catch(() => {});

    // Specializations
    fetch('/api/specializations')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setSpecializations(data))
      .catch(() => {});

    // Lab Tests Catalog
    fetch('/api/lab-tests')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setLabCatalog(data))
      .catch(() => {});

    loadTodayAppointments();
  }, []);

  const loadTodayAppointments = useCallback((docId?: string) => {
    const today = clinicTodayDate();
    const url = `/api/appointments?date=${today}${docId ? `&doctorId=${docId}` : ''}`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setAppointments(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => loadTodayAppointments(doctorFilter), 30_000);
    return () => window.clearInterval(timer);
  }, [doctorFilter, loadTodayAppointments]);

  // Search & Paginate Patients with AbortController
  const fetchPatients = useCallback(async (nameVal: string, phoneVal: string, page = 1) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsSearching(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '6',
      });
      if (nameVal.trim()) params.append('name', nameVal.trim());
      if (phoneVal.trim()) params.append('phone', phoneVal.trim());

      const res = await fetch(`/api/patients?${params.toString()}`, {
        signal: controller.signal,
      });
      if (res.ok) {
        const data = await res.json();
        setPatients(data.items || []);
        setCurrentPage(data.page || 1);
        setTotalPages(data.totalPages || 1);
        setTotalRecords(data.total || 0);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        // Ignored aborted fetches
      }
    } finally {
      setIsSearching(false);
    }
  }, []);

  // 300ms Debounce effect for Patient Search as you type
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchPatients(searchName, searchPhone, 1);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchName, searchPhone, fetchPatients]);

  const handlePageChange = (newPage: number) => {
    fetchPatients(searchName, searchPhone, newPage);
  };

  const handleClearSearch = () => {
    setSearchName('');
    setSearchPhone('');
  };

  // Register Patient
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
      fetchPatients('', '', 1);
    } catch {
      setBookingError('Error creating patient');
    }
  };

  // Filtered Doctors list based on specialization and name search
  const filteredDoctors = doctors.filter((doc) => {
    const matchesSpec = !selectedSpecFilter || doc.specializationId === selectedSpecFilter;
    const docName = (doc.name + ' ' + (doc.nameAr || '')).toLowerCase();
    const matchesName = !doctorNameQuery.trim() || docName.includes(doctorNameQuery.toLowerCase().trim());
    return matchesSpec && matchesName;
  });

  // Keep selected doctor in sync with filter
  useEffect(() => {
    if (filteredDoctors.length > 0 && !filteredDoctors.some((d) => d.id === selectedDoctorId)) {
      setSelectedDoctorId(filteredDoctors[0].id);
    }
  }, [filteredDoctors, selectedDoctorId]);

  // Book appointment
  const handleBookAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) {
      setBookingError('Please select or register a patient first');
      return;
    }
    if (!selectedDoctorId) {
      setBookingError('Please select an active doctor');
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
        setBookingError(
          data.code === 'DATE_FULL' ? t('dateFull') : data.message || 'Failed to book appointment',
        );
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

  // Book Lab Order
  const handleBookLabOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) {
      setLabBookingError('Please select or register a patient first');
      return;
    }
    if (selectedTestIds.length === 0) {
      setLabBookingError(tLab('noTestsSelected'));
      return;
    }

    setLabBookingLoading(true);
    setLabBookingError('');
    setLabBookingResult(null);

    try {
      const res = await fetch('/api/lab-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: selectedPatient.id,
          testIds: selectedTestIds,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setLabBookingError(data.message || 'Failed to book lab order');
        return;
      }

      setLabBookingResult(data);
      setSelectedTestIds([]);
    } catch {
      setLabBookingError('Network error booking lab order');
    } finally {
      setLabBookingLoading(false);
    }
  };

  // Toggle Test Selection
  const toggleTestSelection = (testId: string) => {
    setSelectedTestIds((prev) =>
      prev.includes(testId) ? prev.filter((id) => id !== testId) : [...prev, testId],
    );
  };

  // Filtered Lab Catalog
  const filteredCatalog = labCatalog.filter((item) => {
    const q = labSearchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      item.code.toLowerCase().includes(q) ||
      item.name.toLowerCase().includes(q) ||
      (item.nameAr && item.nameAr.toLowerCase().includes(q))
    );
  });

  // Reissue Portal Credentials
  const handleReissueCredentials = async () => {
    if (!selectedPatient) return;
    if (!window.confirm(tLab('reissueConfirm'))) return;

    setReissuing(true);
    try {
      const res = await fetch(`/api/patients/${selectedPatient.id}/portal-account/reissue`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        setReissuedCredentials(data);
      }
    } catch {} finally {
      setReissuing(false);
    }
  };

  const selectedDoctor = doctors.find((d) => d.id === selectedDoctorId);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
        <p className="text-sm text-slate-500 mt-1">
          Patient search & pagination, doctor multi-filters, appointment booking, lab orders, and 80mm receipts
        </p>
      </div>

      {/* Grid: Patient Selection & Booking Form */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column: Patient Search, Filters & Pagination */}
        <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-800">
                  {t('searchPatientTitle')}
                </h2>
                {isSearching && (
                  <span className="text-xs text-teal-600 animate-pulse font-medium">
                    ({tCommon('loading')})
                  </span>
                )}
              </div>
              <button
                onClick={() => {
                  setShowNewPatient(!showNewPatient);
                  setSelectedPatient(null);
                  setReissuedCredentials(null);
                }}
                className="text-xs px-3 py-1.5 font-medium rounded-md bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100"
              >
                {showNewPatient ? tCommon('search') : `+ ${t('registerPatientTitle')}`}
              </button>
            </div>

            {!showNewPatient ? (
              <div>
                {/* As-you-type Debounced Filters */}
                <div className="space-y-2 mb-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={searchName}
                      onChange={(e) => setSearchName(e.target.value)}
                      placeholder={t('filterByName')}
                      className="px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-teal-500 focus:border-teal-500"
                    />
                    <input
                      type="text"
                      value={searchPhone}
                      onChange={(e) => setSearchPhone(e.target.value)}
                      placeholder={t('filterByPhone')}
                      className="px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-teal-500 focus:border-teal-500"
                    />
                  </div>

                  {(searchName || searchPhone) && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleClearSearch}
                        className="px-3 py-1 bg-slate-100 text-slate-600 rounded-md text-xs hover:bg-slate-200 font-medium"
                      >
                        ✕ {tCommon('clear')}
                      </button>
                    </div>
                  )}
                </div>

                {/* Patient List */}
                <div className="min-h-[220px] divide-y divide-slate-100 border border-slate-200 rounded-md">
                  {patients.length === 0 ? (
                    <p className="p-8 text-xs text-slate-500 text-center">
                      {t('noPatientsFound')}
                    </p>
                  ) : (
                    patients.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => {
                          setSelectedPatient(p);
                          setReissuedCredentials(null);
                        }}
                        className={`p-3 cursor-pointer text-sm flex justify-between items-center hover:bg-teal-50 transition-colors ${
                          selectedPatient?.id === p.id ? 'bg-teal-100 font-semibold text-teal-900' : ''
                        }`}
                      >
                        <div>
                          <div className="font-medium text-slate-900">{p.name}</div>
                          <div className="text-xs text-slate-500 flex gap-2">
                            <span>📞 {p.phone}</span>
                            {p.extraPhone && <span>| {p.extraPhone}</span>}
                          </div>
                        </div>
                        {selectedPatient?.id === p.id && (
                          <span className="text-xs text-teal-700 font-bold bg-white px-2 py-0.5 rounded shadow-xs">
                            ✓ Selected
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Pagination Controls */}
                <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                  <span>
                    {tCommon('total')}: <strong>{totalRecords}</strong>
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage <= 1 || isSearching}
                      className="px-2.5 py-1 border border-slate-300 rounded bg-white hover:bg-slate-50 disabled:opacity-40"
                    >
                      {tCommon('previous')}
                    </button>
                    <span>
                      {tCommon('page')} {currentPage} {tCommon('of')} {totalPages}
                    </span>
                    <button
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage >= totalPages || isSearching}
                      className="px-2.5 py-1 border border-slate-300 rounded bg-white hover:bg-slate-50 disabled:opacity-40"
                    >
                      {tCommon('next')}
                    </button>
                  </div>
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
          </div>

          {/* Selected Patient Banner & Portal Reissue */}
          {selectedPatient && (
            <div className="mt-4 p-3 bg-teal-50 border border-teal-200 rounded-md space-y-2">
              <div className="flex justify-between items-center text-sm">
                <div>
                  <span className="text-xs text-teal-800 font-medium">Selected Patient: </span>
                  <strong>{selectedPatient.name}</strong> ({selectedPatient.phone})
                </div>
                <button
                  onClick={() => {
                    setSelectedPatient(null);
                    setReissuedCredentials(null);
                  }}
                  className="text-xs text-slate-500 hover:text-red-600 underline"
                >
                  Clear
                </button>
              </div>

              {!isLabUser && (
                <div className="pt-2 border-t border-teal-200 flex items-center justify-between">
                  <span className="text-xs text-teal-900">
                    Patient Portal / بوابة المريض
                  </span>
                  <button
                    onClick={handleReissueCredentials}
                    disabled={reissuing}
                    className="text-xs px-2.5 py-1 bg-white border border-teal-300 text-teal-800 font-medium rounded hover:bg-teal-100 disabled:opacity-50"
                  >
                    {reissuing ? tCommon('loading') : `🔑 ${tLab('reissueCredentials')}`}
                  </button>
                </div>
              )}

              {!isLabUser && reissuedCredentials && (
                <div className="p-3 bg-white border border-teal-400 rounded text-xs space-y-1">
                  <div className="font-bold text-teal-800">✓ {tLab('reissuedSuccess')}</div>
                  <div>User ID / اسم المستخدم: <strong className="font-mono">{reissuedCredentials.portalUserId}</strong></div>
                  <div>New Password / كلمة السر: <strong className="font-mono text-teal-900 bg-amber-100 px-1.5 py-0.5 rounded">{reissuedCredentials.plainPassword}</strong></div>
                  <div className="text-[10px] text-slate-500">{tLab('passwordNote')}</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Tabbed Booking Interface (Appointments vs Lab Tests) */}
        <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
          <div>
            {/* Booking Mode Tabs */}
            <div className="flex border-b border-slate-200 mb-5 space-x-4 rtl:space-x-reverse">
              {!isLabUser && (
                <button
                  type="button"
                  onClick={() => setActiveTab('APPOINTMENT')}
                  className={`pb-2.5 px-2 text-sm font-bold border-b-2 transition-colors ${
                    activeTab === 'APPOINTMENT'
                      ? 'border-teal-600 text-teal-700'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  🩺 {t('bookAppointmentTitle')}
                </button>
              )}
              <button
                type="button"
                onClick={() => setActiveTab('LAB')}
                className={`pb-2.5 px-2 text-sm font-bold border-b-2 transition-colors ${
                  activeTab === 'LAB'
                    ? 'border-teal-600 text-teal-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                🔬 {tLab('bookLabOrder')}
              </button>
            </div>

            {/* LAB user notice */}
            {isLabUser && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-lg flex items-center gap-2">
                <span className="text-base">ℹ️</span>
                <span>{tLab('labStaffBookingNotice')}</span>
              </div>
            )}

            {/* TAB 1: DOCTOR APPOINTMENT BOOKING */}
            {activeTab === 'APPOINTMENT' && (
              <form onSubmit={handleBookAppointment} className="space-y-4">
                {bookingError && (
                  <div className="p-3 text-xs bg-red-100 text-red-700 border border-red-200 rounded-md">
                    {bookingError}
                  </div>
                )}

                {/* Doctor Filters: Specialization + Name search */}
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                    Doctor Search & Filter / تصفية الأطباء
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {/* Specialization Filter */}
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        {t('filterBySpecialization')}
                      </label>
                      <select
                        value={selectedSpecFilter}
                        onChange={(e) => setSelectedSpecFilter(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs bg-white focus:outline-none focus:ring-teal-500"
                      >
                        <option value="">{t('allSpecializations')}</option>
                        {specializations.map((s) => (
                          <option key={s.id} value={s.id}>
                            {locale === 'ar' && s.nameAr ? s.nameAr : s.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Doctor Name Search */}
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        {t('filterByName')}
                      </label>
                      <input
                        type="text"
                        value={doctorNameQuery}
                        onChange={(e) => setDoctorNameQuery(e.target.value)}
                        placeholder={t('filterDoctorName')}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs bg-white focus:outline-none focus:ring-teal-500"
                      />
                    </div>
                  </div>

                  {/* Doctor Dropdown Selector */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-800 mb-1">
                      {t('selectDoctor')} * ({filteredDoctors.length} found)
                    </label>
                    {filteredDoctors.length === 0 ? (
                      <p className="text-xs text-red-600 italic py-1">
                        {t('noDoctorsFound')}
                      </p>
                    ) : (
                      <select
                        value={selectedDoctorId}
                        onChange={(e) => setSelectedDoctorId(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm bg-white focus:outline-none focus:ring-teal-500"
                      >
                        {filteredDoctors.map((d) => (
                          <option key={d.id} value={d.id}>
                            {locale === 'ar' && d.nameAr ? d.nameAr : d.name} (
                            {locale === 'ar' && d.specialization.nameAr
                              ? d.specialization.nameAr
                              : d.specialization.name}
                            )
                          </option>
                        ))}
                      </select>
                    )}

                    {/* Working days schedule hint */}
                    {selectedDoctor && (
                      <div className="mt-1 text-[11px] text-slate-600">
                        <strong>{t('workingDays')}: </strong>
                        {selectedDoctor.schedules.length === 0
                          ? 'No schedule'
                          : selectedDoctor.schedules
                              .map((s) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][s.weekday])
                              .join(', ')}
                      </div>
                    )}
                  </div>
                </div>

                {/* Appointment Date */}
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
                  disabled={loading || !selectedPatient || filteredDoctors.length === 0}
                  className="w-full py-2 bg-teal-600 text-white rounded-md text-sm font-medium hover:bg-teal-700 disabled:opacity-50"
                >
                  {loading ? tCommon('loading') : t('bookBtn')}
                </button>

                {/* Booking Success Banner & Print Link */}
                {bookingResult && (
                  <div className="mt-4 p-4 bg-teal-50 border border-teal-300 rounded-lg text-center">
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
              </form>
            )}

            {/* TAB 2: LAB TESTS ORDER BOOKING */}
            {activeTab === 'LAB' && (
              <form onSubmit={handleBookLabOrder} className="space-y-4">
                {labBookingError && (
                  <div className="p-3 text-xs bg-red-100 text-red-700 border border-red-200 rounded-md">
                    {labBookingError}
                  </div>
                )}

                {/* Lab Test Catalog Picker */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="block text-xs font-bold text-slate-800">
                      {tLab('selectTests')} * ({selectedTestIds.length} selected)
                    </label>
                    <input
                      type="text"
                      value={labSearchQuery}
                      onChange={(e) => setLabSearchQuery(e.target.value)}
                      placeholder={tLab('searchTests')}
                      className="px-2.5 py-1 border border-slate-300 rounded text-xs focus:outline-none focus:ring-teal-500"
                    />
                  </div>

                  {/* Test Catalog Items */}
                  <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-md">
                    {filteredCatalog.length === 0 ? (
                      <p className="p-4 text-xs text-slate-500 text-center">
                        No tests match search
                      </p>
                    ) : (
                      filteredCatalog.map((test) => {
                        const isSelected = selectedTestIds.includes(test.id);
                        return (
                          <div
                            key={test.id}
                            onClick={() => toggleTestSelection(test.id)}
                            className={`p-2.5 text-xs flex justify-between items-center cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-teal-50 font-bold text-teal-900'
                                : 'hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            <div>
                              <span className="font-mono text-slate-500 mr-2 rtl:mr-0 rtl:ml-2">
                                [{test.code}]
                              </span>
                              <span>
                                {locale === 'ar' && test.nameAr ? test.nameAr : test.name}
                              </span>
                              {test.referenceRange && (
                                <span className="text-[11px] text-slate-400 ml-2 rtl:ml-0 rtl:mr-2">
                                  ({test.referenceRange} {test.unit || ''})
                                </span>
                              )}
                            </div>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              className="rounded text-teal-600 focus:ring-teal-500"
                            />
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={labBookingLoading || !selectedPatient || selectedTestIds.length === 0}
                  className="w-full py-2 bg-teal-600 text-white rounded-md text-sm font-medium hover:bg-teal-700 disabled:opacity-50"
                >
                  {labBookingLoading ? tCommon('loading') : `🔬 ${tLab('bookLabOrder')}`}
                </button>

                {/* Lab Booking Success Banner & Credentials Presentation */}
                {labBookingResult && (
                  <div className="mt-4 p-4 bg-teal-50 border border-teal-300 rounded-lg space-y-3">
                    <div className="text-teal-900 font-bold text-sm text-center">
                      ✓ {tLab('orderSuccess')}
                    </div>

                    {/* Portal Credentials Box */}
                    <div className="p-3 bg-white border border-teal-400 rounded text-xs space-y-1.5 shadow-xs">
                      <div className="font-bold text-teal-800 border-b border-slate-200 pb-1">
                        {tLab('credentialsNotice')}
                      </div>
                      <div className="text-[11px] text-slate-600">
                        {tLab('credentialsNoticeSubtitle')}
                      </div>
                      <div className="flex justify-between items-center pt-1">
                        <span className="font-semibold">{tLab('portalUserId')}:</span>
                        <span className="font-mono font-bold text-sm bg-slate-100 px-2 py-0.5 rounded">
                          {labBookingResult.portalAccount.portalUserId}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="font-semibold">{tLab('portalPassword')}:</span>
                        {labBookingResult.portalAccount.plainPassword ? (
                          <span className="font-mono font-bold text-sm bg-amber-100 text-amber-900 px-2 py-0.5 rounded">
                            {labBookingResult.portalAccount.plainPassword}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-500 italic">
                            ({tLab('passwordGivenEarlier')})
                          </span>
                        )}
                      </div>
                      {labBookingResult.portalAccount.plainPassword && (
                        <p className="text-[10px] text-amber-800">
                          * {tLab('passwordNote')}
                        </p>
                      )}
                    </div>

                    <div className="text-center pt-1">
                      <Link
                        href={`/print/lab/${labBookingResult.order.id}${
                          labBookingResult.portalAccount.plainPassword
                            ? `?pwd=${encodeURIComponent(
                                labBookingResult.portalAccount.plainPassword,
                              )}`
                            : ''
                        }`}
                        target="_blank"
                        className="inline-block px-4 py-2 bg-teal-700 text-white text-xs font-bold rounded shadow hover:bg-teal-800"
                      >
                        🖨️ {tCommon('print')} (80mm Lab Receipt)
                      </Link>
                    </div>
                  </div>
                )}
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Today's Appointments Table */}
      {!isLabUser && <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
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
                      {a.bookingSource === 'ONLINE' && (
                        <span className="ms-2 inline-block rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-800">
                          {t('onlineBooking')}
                        </span>
                      )}
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
      </div>}
    </div>
  );
}
