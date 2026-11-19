'use client';

import { useState, useEffect, use } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import Link from 'next/link';

interface LabOrderItem {
  id: string;
  resultValue?: string;
  flag?: 'NORMAL' | 'HIGH' | 'LOW';
  enteredBy?: string;
  enteredAt?: string;
  test: {
    id: string;
    code: string;
    name: string;
    nameAr?: string;
    unit?: string;
    referenceRange?: string;
  };
}

interface LabOrderDetail {
  id: string;
  status: 'BOOKED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  createdAt: string;
  completedAt?: string;
  patient: {
    id: string;
    name: string;
    phone: string;
    portalAccountLocal?: {
      portalUserId: string;
    };
  };
  items: LabOrderItem[];
}

export default function LabOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations('lab');
  const tCommon = useTranslations('common');
  const locale = useLocale();

  const [order, setOrder] = useState<LabOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [completing, setCompleting] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ id: string; role: string; name: string } | null>(null);

  // Form input state per item: itemId -> { resultValue, flag }
  const [itemForms, setItemForms] = useState<
    Record<string, { resultValue: string; flag: 'NORMAL' | 'HIGH' | 'LOW' | '' }>
  >({});
  const [savingItem, setSavingItem] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.user) setCurrentUser(data.user);
      })
      .catch(() => {});
  }, []);

  const canEdit = currentUser?.role === 'LAB' || currentUser?.role === 'ADMIN';

  const loadOrder = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/lab-orders/${id}`);
      if (!res.ok) {
        setError('Failed to load lab order');
        return;
      }
      const data: LabOrderDetail = await res.json();
      setOrder(data);

      // Populate item forms
      const forms: Record<string, { resultValue: string; flag: 'NORMAL' | 'HIGH' | 'LOW' | '' }> = {};
      data.items.forEach((item) => {
        forms[item.id] = {
          resultValue: item.resultValue || '',
          flag: item.flag || '',
        };
      });
      setItemForms(forms);
    } catch {
      setError('Network error loading order');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrder();
  }, [id]);

  const handleItemChange = (
    itemId: string,
    field: 'resultValue' | 'flag',
    value: string,
  ) => {
    setItemForms((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [field]: value,
      },
    }));
  };

  const handleSaveResult = async (itemId: string) => {
    setError('');
    setSuccessMsg('');
    const form = itemForms[itemId];
    if (!form || !form.resultValue.trim()) {
      setError('Please enter a result value');
      return;
    }

    setSavingItem(itemId);
    try {
      const res = await fetch(`/api/lab-orders/${id}/items/${itemId}/result`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resultValue: form.resultValue.trim(),
          flag: form.flag || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setError(err.message || 'Failed to save result');
        return;
      }

      setSuccessMsg('Result saved successfully');
      await loadOrder();
    } catch {
      setError('Network error saving result');
    } finally {
      setSavingItem(null);
    }
  };

  const handleCompleteOrder = async () => {
    setError('');
    setSuccessMsg('');

    // Check client-side if all items have values
    const missing = order?.items.some((i) => !itemForms[i.id]?.resultValue?.trim());
    if (missing) {
      setError(t('missingResultsAlert'));
      return;
    }

    if (!window.confirm(t('completeConfirm'))) return;

    setCompleting(true);
    try {
      const res = await fetch(`/api/lab-orders/${id}/complete`, {
        method: 'POST',
      });

      if (!res.ok) {
        const err = await res.json();
        setError(err.message || 'Failed to complete order');
        return;
      }

      setSuccessMsg('Order finalized and queued for portal sync!');
      await loadOrder();
    } catch {
      setError('Network error completing order');
    } finally {
      setCompleting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-sm text-slate-500 animate-pulse">
        {tCommon('loading')}
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-8 text-center text-sm text-red-500">
        {error || 'Lab order not found'}
      </div>
    );
  }

  const receiptNo = `LAB-${order.id.substring(0, 8).toUpperCase()}`;
  const isCompleted = order.status === 'COMPLETED';

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/lab"
              className="text-xs text-teal-600 hover:text-teal-800 font-semibold"
            >
              ← {t('ordersTitle')}
            </Link>
            <span className="text-slate-300">/</span>
            <span className="text-xs font-mono font-bold text-slate-700">
              {receiptNo}
            </span>
            {!canEdit && (
              <span className="text-[11px] px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold">
                Read-Only (Front Desk) / للقراءة فقط
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">
            {canEdit ? t('enterResults') : t('viewDetails')} — {order.patient.name}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/print/results/${order.id}`}
            target="_blank"
            className="px-3.5 py-1.5 bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold rounded shadow-xs inline-flex items-center gap-1.5"
          >
            📄 {t('printResults')}
          </Link>
          <Link
            href={`/print/lab/${order.id}`}
            target="_blank"
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded shadow-xs"
          >
            🖨️ {tCommon('print')} (80mm)
          </Link>
          {canEdit && !isCompleted && (
            <button
              onClick={handleCompleteOrder}
              disabled={completing}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded shadow-xs disabled:opacity-50"
            >
              {completing ? tCommon('loading') : `✓ ${t('completeOrder')}`}
            </button>
          )}
        </div>
      </div>

      {/* Role notice for Front Desk */}
      {!canEdit && (
        <div className="p-3.5 bg-blue-50 border border-blue-200 text-blue-900 text-xs rounded-lg flex items-center gap-2">
          <span className="text-base">ℹ️</span>
          <span>{t('readOnlyNotice')}</span>
        </div>
      )}

      {/* Notifications */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg font-medium">
          {successMsg}
        </div>
      )}

      {isCompleted && (
        <div className="p-4 bg-amber-50 border border-amber-300 text-amber-900 text-xs rounded-lg flex items-start gap-2">
          <span className="text-base">⚠️</span>
          <div>
            <strong>{t('completedAlert')}</strong>
            <p className="mt-0.5 text-amber-800">
              Completed at: {new Date(order.completedAt!).toLocaleString()}
            </p>
          </div>
        </div>
      )}

      {/* Order Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase">
            {t('patientName')}
          </div>
          <div className="text-base font-bold text-slate-900 mt-1">
            {order.patient.name}
          </div>
          <div className="text-xs text-slate-600 mt-0.5">📞 {order.patient.phone}</div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase">
            {t('orderStatus')}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span
              className={`text-xs px-3 py-1 rounded-full font-bold border ${
                order.status === 'COMPLETED'
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                  : order.status === 'IN_PROGRESS'
                  ? 'bg-amber-100 text-amber-800 border-amber-200'
                  : 'bg-blue-100 text-blue-800 border-blue-200'
              }`}
            >
              {order.status}
            </span>
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Booked: {new Date(order.createdAt).toLocaleDateString()}
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase">
            {t('portalUserId')}
          </div>
          <div className="text-base font-mono font-bold text-teal-800 mt-1">
            {order.patient.portalAccountLocal?.portalUserId || 'N/A'}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Sync status: {order.status === 'COMPLETED' ? 'Queued / Ready' : 'Pending results'}
          </div>
        </div>
      </div>

      {/* Test Items Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-bold text-slate-800">
            {t('selectTests')} ({order.items.length})
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-slate-600 font-medium text-xs">
              <tr>
                <th className="px-4 py-3 text-start">Code / {t('testName')}</th>
                <th className="px-4 py-3 text-start">{t('referenceRange')}</th>
                <th className="px-4 py-3 text-start">{t('unit')}</th>
                <th className="px-4 py-3 text-start">{t('resultValue')} {canEdit && '*'}</th>
                <th className="px-4 py-3 text-start">{t('flag')}</th>
                {canEdit && <th className="px-4 py-3 text-end">{tCommon('actions')}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {order.items.map((item) => {
                const form = itemForms[item.id] || { resultValue: '', flag: '' };
                const isSaving = savingItem === item.id;

                return (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    {/* Test Code & Name */}
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-900">
                        {locale === 'ar' && item.test.nameAr
                          ? item.test.nameAr
                          : item.test.name}
                      </div>
                      <div className="text-xs text-slate-500 font-mono">
                        {item.test.code}
                      </div>
                    </td>

                    {/* Reference Range */}
                    <td className="px-4 py-3 text-xs text-slate-600 font-mono">
                      {item.test.referenceRange || '—'}
                    </td>

                    {/* Unit */}
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {item.test.unit || '—'}
                    </td>

                    {/* Result Value */}
                    <td className="px-4 py-3">
                      {canEdit ? (
                        <input
                          type="text"
                          value={form.resultValue}
                          onChange={(e) =>
                            handleItemChange(item.id, 'resultValue', e.target.value)
                          }
                          placeholder="e.g. 95"
                          className="w-36 px-2.5 py-1.5 border border-slate-300 rounded text-sm font-semibold focus:outline-none focus:ring-teal-500"
                        />
                      ) : (
                        <span className="font-mono font-bold text-sm text-slate-900">
                          {item.resultValue || (
                            <span className="text-slate-400 font-normal italic">
                              Pending / قيد الانتظار
                            </span>
                          )}
                        </span>
                      )}
                    </td>

                    {/* Flag */}
                    <td className="px-4 py-3">
                      {canEdit ? (
                        <select
                          value={form.flag}
                          onChange={(e) =>
                            handleItemChange(item.id, 'flag', e.target.value)
                          }
                          className={`px-2 py-1.5 border rounded text-xs font-semibold focus:outline-none ${
                            form.flag === 'HIGH'
                              ? 'bg-rose-50 text-rose-700 border-rose-300'
                              : form.flag === 'LOW'
                              ? 'bg-amber-50 text-amber-700 border-amber-300'
                              : form.flag === 'NORMAL'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                              : 'bg-white text-slate-700 border-slate-300'
                          }`}
                        >
                          <option value="">— {t('flag')} —</option>
                          <option value="NORMAL">{t('flagNormal')}</option>
                          <option value="HIGH">{t('flagHigh')}</option>
                          <option value="LOW">{t('flagLow')}</option>
                        </select>
                      ) : (
                        <>
                          {item.flag === 'NORMAL' && (
                            <span className="px-2 py-0.5 text-xs font-bold text-emerald-800 bg-emerald-50 rounded border border-emerald-200">
                              NORMAL
                            </span>
                          )}
                          {item.flag === 'HIGH' && (
                            <span className="px-2 py-0.5 text-xs font-bold text-rose-800 bg-rose-50 rounded border border-rose-200">
                              ▲ HIGH
                            </span>
                          )}
                          {item.flag === 'LOW' && (
                            <span className="px-2 py-0.5 text-xs font-bold text-amber-800 bg-amber-50 rounded border border-amber-200">
                              ▼ LOW
                            </span>
                          )}
                          {!item.flag && <span className="text-slate-400">—</span>}
                        </>
                      )}
                    </td>

                    {/* Actions */}
                    {canEdit && (
                      <td className="px-4 py-3 text-end">
                        <button
                          onClick={() => handleSaveResult(item.id)}
                          disabled={isSaving}
                          className="px-3 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded text-xs font-medium shadow-xs disabled:opacity-50"
                        >
                          {isSaving ? tCommon('loading') : t('saveResult')}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
