'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

interface Specialization {
  id: string;
  name: string;
  nameAr: string | null;
}

interface Doctor {
  id: string;
  name: string;
  nameAr: string | null;
}

interface BookingConfirmation {
  queueNumber: number;
  appointmentDate: string;
  doctor: Doctor;
  specialization: Specialization;
}

function getClinicDate(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    numberingSystem: 'latn',
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

async function readJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', signal });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.code || 'BOOKING_UNAVAILABLE');
  return body as T;
}

function displayName(item: { name: string; nameAr?: string | null }, locale: string) {
  return locale === 'ar' && item.nameAr ? item.nameAr : item.name;
}

export function BookingWizard({ timeZone }: { timeZone: string }) {
  const t = useTranslations('booking');
  const locale = useLocale();
  const [specializations, setSpecializations] = useState<Specialization[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [specializationId, setSpecializationId] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [appointmentDate, setAppointmentDate] = useState('');
  const [patientName, setPatientName] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [step, setStep] = useState(0);
  const [loadingSpecializations, setLoadingSpecializations] = useState(true);
  const [loadingDoctors, setLoadingDoctors] = useState(false);
  const [loadingDates, setLoadingDates] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);

  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone,
      numberingSystem: 'latn',
    }),
    [locale, timeZone],
  );

  useEffect(() => {
    let active = true;
    readJson<Specialization[]>('/api/booking/specializations')
      .then((items) => { if (active) setSpecializations(items); })
      .catch(() => { if (active) setError('BOOKING_UNAVAILABLE'); })
      .finally(() => { if (active) setLoadingSpecializations(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!specializationId) {
      setDoctors([]);
      return;
    }
    const controller = new AbortController();
    setLoadingDoctors(true);
    setDoctorId('');
    setAppointmentDate('');
    setAvailableDates([]);
    readJson<Doctor[]>(`/api/booking/doctors?specializationId=${encodeURIComponent(specializationId)}`, controller.signal)
      .then((items) => setDoctors(items))
      .catch(() => { if (!controller.signal.aborted) setError('BOOKING_UNAVAILABLE'); })
      .finally(() => { if (!controller.signal.aborted) setLoadingDoctors(false); });
    return () => controller.abort();
  }, [specializationId]);

  useEffect(() => {
    if (!doctorId) {
      setAvailableDates([]);
      return;
    }
    const controller = new AbortController();
    const from = getClinicDate(timeZone);
    const endDate = new Date(`${from}T00:00:00.000Z`);
    endDate.setUTCDate(endDate.getUTCDate() + 90);
    const to = endDate.toISOString().slice(0, 10);
    const query = new URLSearchParams({ doctorId, from, to });
    setLoadingDates(true);
    setAppointmentDate('');
    readJson<{ dates: string[] }>(`/api/booking/availability?${query}`, controller.signal)
      .then((result) => setAvailableDates(result.dates))
      .catch(() => { if (!controller.signal.aborted) setError('BOOKING_UNAVAILABLE'); })
      .finally(() => { if (!controller.signal.aborted) setLoadingDates(false); });
    return () => controller.abort();
  }, [doctorId, timeZone]);

  const getErrorMessage = (code: string) => {
    switch (code) {
      case 'DATE_FULL': return t('dateFull');
      case 'DATE_UNAVAILABLE':
      case 'DOCTOR_UNAVAILABLE':
      case 'INVALID_DATE':
      case 'INVALID_DATE_RANGE':
      case 'BOOKING_CONFLICT': return t('dateUnavailable');
      case 'INVALID_REQUEST': return t('invalidDetails');
      case 'PATIENT_MATCH_REQUIRES_REVIEW': return t('contactClinic');
      case 'RATE_LIMITED': return t('rateLimited');
      default: return t('unavailable');
    }
  };

  const submitBooking = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const response = await fetch('/api/booking/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          specializationId,
          doctorId,
          appointmentDate,
          patientName,
          patientPhone,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.code || 'BOOKING_UNAVAILABLE');
      setConfirmation(body as BookingConfirmation);
    } catch (cause) {
      setError(getErrorMessage(cause instanceof Error ? cause.message : 'BOOKING_UNAVAILABLE'));
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setSpecializationId('');
    setDoctorId('');
    setAppointmentDate('');
    setPatientName('');
    setPatientPhone('');
    setStep(0);
    setConfirmation(null);
    setError('');
  };

  if (confirmation) {
    return (
      <section className="rounded-2xl border border-teal-200 bg-white p-6 shadow-sm sm:p-9" aria-live="polite">
        <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-full bg-teal-100 text-2xl text-teal-800" aria-hidden="true">✓</div>
        <h2 className="text-2xl font-bold text-slate-900">{t('successTitle')}</h2>
        <p className="mt-2 text-slate-600">{t('successSubtitle')}</p>
        <div className="mt-6 rounded-xl bg-teal-50 p-5 text-center">
          <p className="text-sm font-semibold text-teal-900">{t('queueNumber')}</p>
          <p className="mt-1 text-5xl font-bold text-teal-800">{confirmation.queueNumber}</p>
        </div>
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-slate-500">{t('specialization')}</dt><dd className="font-semibold text-slate-900">{displayName(confirmation.specialization, locale)}</dd></div>
          <div><dt className="text-slate-500">{t('doctor')}</dt><dd className="font-semibold text-slate-900">{displayName(confirmation.doctor, locale)}</dd></div>
          <div><dt className="text-slate-500">{t('appointmentDate')}</dt><dd className="font-semibold text-slate-900">{dateFormatter.format(new Date(`${confirmation.appointmentDate}T12:00:00.000Z`))}</dd></div>
        </dl>
        <button type="button" onClick={reset} className="mt-7 rounded-lg bg-teal-700 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-800">
          {t('bookAnother')}
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
      <div className="mb-7 grid grid-cols-4 gap-2" aria-label={t('progress')}>
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className={`h-1.5 rounded-full ${step >= item ? 'bg-teal-700' : 'bg-slate-200'}`} />
        ))}
      </div>

      {error && <p role="alert" className="mb-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error === 'BOOKING_UNAVAILABLE' ? t('unavailable') : error}</p>}

      {step === 0 && (
        <div>
          <label htmlFor="specialization" className="mb-2 block text-sm font-semibold text-slate-800">{t('selectSpecialization')}</label>
          <select id="specialization" value={specializationId} onChange={(event) => { setSpecializationId(event.target.value); setError(''); }} disabled={loadingSpecializations} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-100">
          <option value="">{loadingSpecializations ? t('loading') : t('specializationPlaceholder')}</option>
            {specializations.map((item) => <option key={item.id} value={item.id}>{displayName(item, locale)}</option>)}
          </select>
          {!loadingSpecializations && specializations.length === 0 && <p className="mt-3 text-sm text-slate-500">{t('noSpecializations')}</p>}
          <div className="mt-6 flex justify-end">
            <button type="button" disabled={!specializationId} onClick={() => setStep(1)} className="rounded-lg bg-teal-700 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 hover:bg-teal-800">{t('continue')}</button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div>
          <label htmlFor="doctor" className="mb-2 block text-sm font-semibold text-slate-800">{t('selectDoctor')}</label>
          <select id="doctor" value={doctorId} onChange={(event) => { setDoctorId(event.target.value); setError(''); }} disabled={loadingDoctors} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-100">
            <option value="">{loadingDoctors ? t('loading') : t('doctorPlaceholder')}</option>
            {doctors.map((item) => <option key={item.id} value={item.id}>{displayName(item, locale)}</option>)}
          </select>
          {!loadingDoctors && doctors.length === 0 && <p className="mt-3 text-sm text-slate-500">{t('noDoctors')}</p>}
          <div className="mt-6 flex justify-between">
            <button type="button" onClick={() => setStep(0)} className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('back')}</button>
            <button type="button" disabled={!doctorId} onClick={() => setStep(2)} className="rounded-lg bg-teal-700 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 hover:bg-teal-800">{t('continue')}</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <label htmlFor="appointmentDate" className="mb-2 block text-sm font-semibold text-slate-800">{t('selectDate')}</label>
          <select id="appointmentDate" value={appointmentDate} onChange={(event) => { setAppointmentDate(event.target.value); setError(''); }} disabled={loadingDates} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-100">
            <option value="">{loadingDates ? t('loading') : t('datePlaceholder')}</option>
            {availableDates.map((date) => <option key={date} value={date}>{dateFormatter.format(new Date(`${date}T12:00:00.000Z`))}</option>)}
          </select>
          {!loadingDates && availableDates.length === 0 && <p className="mt-3 text-sm text-slate-500">{t('noAvailableDates')}</p>}
          <div className="mt-6 flex justify-between">
            <button type="button" onClick={() => setStep(1)} className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('back')}</button>
            <button type="button" disabled={!appointmentDate} onClick={() => setStep(3)} className="rounded-lg bg-teal-700 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 hover:bg-teal-800">{t('continue')}</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <form onSubmit={submitBooking}>
          <h2 className="mb-5 text-lg font-bold text-slate-900">{t('yourDetails')}</h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="patientName" className="mb-2 block text-sm font-semibold text-slate-800">{t('fullName')}</label>
              <input id="patientName" autoComplete="name" required minLength={2} maxLength={120} value={patientName} onChange={(event) => setPatientName(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-3 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-100" />
            </div>
            <div>
              <label htmlFor="patientPhone" className="mb-2 block text-sm font-semibold text-slate-800">{t('phone')}</label>
              <input id="patientPhone" type="tel" inputMode="tel" autoComplete="tel" required minLength={7} maxLength={24} pattern="\+?(?=(?:\D*\d){7})[0-9 ().-]{7,24}" value={patientPhone} onChange={(event) => setPatientPhone(event.target.value)} dir="ltr" className="w-full rounded-lg border border-slate-300 px-3 py-3 text-sm focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-100" />
              <p className="mt-1 text-xs text-slate-500">{t('phoneHint')}</p>
            </div>
          </div>
          <div className="mt-6 flex justify-between">
            <button type="button" onClick={() => setStep(2)} className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">{t('back')}</button>
            <button type="submit" disabled={submitting} className="rounded-lg bg-teal-700 px-5 py-3 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60 hover:bg-teal-800">{submitting ? t('submitting') : t('confirmBooking')}</button>
          </div>
        </form>
      )}
    </section>
  );
}
