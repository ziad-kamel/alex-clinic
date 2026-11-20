'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

type SyncStatus = 'PENDING' | 'SENT' | 'FAILED';
type SyncType = 'ACCOUNT_UPSERT' | 'RESULT_UPSERT';

interface OutboxRow {
  id: string;
  type: SyncType;
  status: SyncStatus;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: string | null;
  createdAt: string;
}

interface OutboxResponse {
  items: OutboxRow[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function SyncOutboxPage() {
  const t = useTranslations('sync');
  const locale = useLocale();
  const [role, setRole] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<SyncStatus | ''>('');
  const [data, setData] = useState<OutboxResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [retrying, setRetrying] = useState<string | null>(null);

  const loadOutbox = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (statusFilter) params.set('status', statusFilter);
      const response = await fetch(`/api/sync/outbox?${params.toString()}`);
      if (!response.ok) throw new Error(t('loadError'));
      setData((await response.json()) as OutboxResponse);
    } catch {
      setError(t('loadError'));
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, t]);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => setRole(result?.user?.role ?? ''))
      .catch(() => setRole(''));
  }, []);

  useEffect(() => {
    if (role === 'ADMIN') void loadOutbox();
  }, [loadOutbox, role]);

  const retry = async (id: string) => {
    setRetrying(id);
    setNotice('');
    setError('');
    try {
      const response = await fetch(`/api/sync/outbox/${id}/retry`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error(t('retryError'));
      setNotice(t('retrySuccess'));
      await loadOutbox();
    } catch {
      setError(t('retryError'));
    } finally {
      setRetrying(null);
    }
  };

  const formatDate = (value: string | null) => {
    if (!value) return '—';
    return new Intl.DateTimeFormat(
      locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US',
      { dateStyle: 'medium', timeStyle: 'short' },
    ).format(new Date(value));
  };

  if (role === null) {
    return (
      <p className="p-8 text-center text-sm text-slate-500">
        {t('description')}
      </p>
    );
  }
  if (role !== 'ADMIN') {
    return (
      <p className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        {t('notAuthorized')}
      </p>
    );
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('description')}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(event) => {
              setPage(1);
              setStatusFilter(event.target.value as SyncStatus | '');
            }}
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">{t('allStatuses')}</option>
            <option value="PENDING">PENDING</option>
            <option value="SENT">SENT</option>
            <option value="FAILED">FAILED</option>
          </select>
          <button
            type="button"
            onClick={() => void loadOutbox()}
            disabled={loading}
            className="rounded bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
          >
            {t('refresh')}
          </button>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {notice}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
            <tr>
              <th className="px-4 py-3 text-start">{t('type')}</th>
              <th className="px-4 py-3 text-start">{t('status')}</th>
              <th className="px-4 py-3 text-start">{t('attempts')}</th>
              <th className="px-4 py-3 text-start">{t('createdAt')}</th>
              <th className="px-4 py-3 text-start">{t('nextAttempt')}</th>
              <th className="px-4 py-3 text-start">{t('lastError')}</th>
              <th className="px-4 py-3 text-end" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-slate-500"
                >
                  {t('description')}
                </td>
              </tr>
            ) : !data || data.items.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-slate-500"
                >
                  {t('noRows')}
                </td>
              </tr>
            ) : (
              data.items.map((row) => (
                <tr key={row.id} className="align-top">
                  <td className="px-4 py-3 font-mono text-xs">{row.type}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                        row.status === 'FAILED'
                          ? 'bg-rose-100 text-rose-800'
                          : row.status === 'SENT'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">{row.attempts}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs">
                    {formatDate(row.createdAt)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs">
                    {formatDate(row.nextAttemptAt)}
                  </td>
                  <td className="max-w-xs break-words px-4 py-3 text-xs text-rose-700">
                    {row.lastError ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-end">
                    {row.status === 'FAILED' && (
                      <button
                        type="button"
                        onClick={() => void retry(row.id)}
                        disabled={retrying === row.id}
                        className="rounded border border-teal-700 px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-50 disabled:opacity-50"
                      >
                        {t('retry')}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1 || loading}
            className="rounded border border-slate-300 px-3 py-1.5 disabled:opacity-50"
          >
            {t('previous')}
          </button>
          <span>
            {t('page')} {data.page} {t('of')} {data.totalPages}
          </span>
          <button
            type="button"
            onClick={() =>
              setPage((current) => Math.min(data.totalPages, current + 1))
            }
            disabled={page >= data.totalPages || loading}
            className="rounded border border-slate-300 px-3 py-1.5 disabled:opacity-50"
          >
            {t('next')}
          </button>
        </div>
      )}
    </section>
  );
}
