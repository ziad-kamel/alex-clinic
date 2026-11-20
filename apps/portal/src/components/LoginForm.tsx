'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

export function LoginForm() {
  const t = useTranslations('login');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, password }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(
          result.code === 'RATE_LIMITED' ? t('rateLimited') : t('invalid'),
        );
        return;
      }

      router.replace(
        result.mustChangePassword ? '/change-password' : '/results',
      );
      router.refresh();
    } catch {
      setError(t('networkError'));
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
      <div>
        <label
          htmlFor="userId"
          className="mb-1.5 block text-sm font-medium text-slate-700"
        >
          {t('userId')}
        </label>
        <input
          id="userId"
          autoComplete="username"
          required
          maxLength={64}
          value={userId}
          onChange={(event) => setUserId(event.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm uppercase outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
        />
      </div>
      <div>
        <label
          htmlFor="password"
          className="mb-1.5 block text-sm font-medium text-slate-700"
        >
          {t('password')}
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={256}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-800 disabled:cursor-wait disabled:opacity-60"
      >
        {submitting ? tCommon('loading') : t('submit')}
      </button>
    </form>
  );
}
