'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

export function ChangePasswordForm() {
  const t = useTranslations('password');
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (newPassword !== confirmPassword) {
      setError(t('mismatch'));
      return;
    }
    if (newPassword.length < 8) {
      setError(t('invalid'));
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!response.ok) {
        setError(t('failed'));
        return;
      }
      setSuccess(t('success'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      router.refresh();
    } catch {
      setError(t('failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      {success && (
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {success}
        </p>
      )}
      <div>
        <label
          htmlFor="currentPassword"
          className="mb-1.5 block text-sm font-medium text-slate-700"
        >
          {t('current')}
        </label>
        <input
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
        />
      </div>
      <div>
        <label
          htmlFor="newPassword"
          className="mb-1.5 block text-sm font-medium text-slate-700"
        >
          {t('new')}
        </label>
        <input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
        />
      </div>
      <div>
        <label
          htmlFor="confirmPassword"
          className="mb-1.5 block text-sm font-medium text-slate-700"
        >
          {t('confirm')}
        </label>
        <input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-800 disabled:cursor-wait disabled:opacity-60"
      >
        {submitting ? t('submit') : t('submit')}
      </button>
    </form>
  );
}
