'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import Link from 'next/link';

interface LabOrder {
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
  items: {
    id: string;
    resultValue?: string;
    flag?: 'NORMAL' | 'HIGH' | 'LOW';
    test: {
      id: string;
      code: string;
      name: string;
      nameAr?: string;
    };
  }[];
}

export default function LabDashboardPage() {
  const t = useTranslations('lab');
  const tCommon = useTranslations('common');
  const locale = useLocale();

  const [orders, setOrders] = useState<LabOrder[]>([]);
  const [currentUser, setCurrentUser] = useState<{ role: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [dateFilter, setDateFilter] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.user) setCurrentUser(data.user);
      })
      .catch(() => {});
  }, []);

  const canManageResults =
    currentUser?.role === 'LAB' || currentUser?.role === 'ADMIN';

  const loadOrders = async (status = statusFilter, date = dateFilter) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status !== 'ALL') params.append('status', status);
      if (date) params.append('date', date);

      const res = await fetch(`/api/lab-orders?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setOrders(data);
      }
    } catch {
      // Error loading orders
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders(statusFilter, dateFilter);
  }, [statusFilter, dateFilter]);

  const getStatusBadge = (status: LabOrder['status']) => {
    switch (status) {
      case 'BOOKED':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'IN_PROGRESS':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'COMPLETED':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'CANCELLED':
        return 'bg-rose-100 text-rose-800 border-rose-200';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {t('ordersTitle')} — Manage test orders, enter results, and finalize for portal sync
          </p>
        </div>

        {/* Date Filter */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-600">
            {t('orderDate')}:
          </label>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-3 py-1.5 border border-slate-300 rounded-md text-xs bg-white focus:outline-none focus:ring-teal-500"
          />
          {dateFilter && (
            <button
              onClick={() => setDateFilter('')}
              className="text-xs text-slate-500 hover:text-slate-800 underline"
            >
              {tCommon('all')}
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex border-b border-slate-200 space-x-4 rtl:space-x-reverse text-sm font-medium">
        {[
          { key: 'ALL', label: t('allOrders') },
          { key: 'BOOKED', label: 'Booked / جديد' },
          { key: 'IN_PROGRESS', label: t('pendingOrders') },
          { key: 'COMPLETED', label: t('completedOrders') },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`pb-2.5 px-1 border-b-2 transition-colors ${
              statusFilter === tab.key
                ? 'border-teal-600 text-teal-700 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500 animate-pulse">
            {tCommon('loading')}
          </div>
        ) : orders.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            {t('noOrders')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-slate-600 font-medium text-xs">
                <tr>
                  <th className="px-4 py-3 text-start">Receipt #</th>
                  <th className="px-4 py-3 text-start">{t('patientName')}</th>
                  <th className="px-4 py-3 text-start">{t('patientPhone')}</th>
                  <th className="px-4 py-3 text-start">{t('selectTests')}</th>
                  <th className="px-4 py-3 text-start">{t('orderStatus')}</th>
                  <th className="px-4 py-3 text-end">{tCommon('actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((order) => {
                  const receiptNo = `LAB-${order.id.substring(0, 8).toUpperCase()}`;
                  const completedItems = order.items.filter((i) => i.resultValue).length;
                  const totalItems = order.items.length;

                  return (
                    <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-bold text-slate-900">
                        {receiptNo}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {order.patient.name}
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-xs">
                        {order.patient.phone}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700">
                        <div className="font-semibold">
                          {order.items
                            .map((i) => (locale === 'ar' && i.test.nameAr ? i.test.nameAr : i.test.name))
                            .join(', ')}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Progress: {completedItems}/{totalItems} results entered
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${getStatusBadge(
                            order.status,
                          )}`}
                        >
                          {order.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-end space-x-2 rtl:space-x-reverse">
                        <Link
                          href={`/dashboard/lab/${order.id}`}
                          className="inline-block text-xs px-3 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded font-medium shadow-xs"
                        >
                          {canManageResults
                            ? (order.status === 'COMPLETED' ? t('viewDetails') : t('enterResults'))
                            : t('viewDetails')}
                        </Link>
                        {order.status === 'COMPLETED' && (
                          <Link
                            href={`/print/results/${order.id}`}
                            target="_blank"
                            className="inline-block text-xs px-2.5 py-1 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 rounded font-medium"
                          >
                            📄 {t('printResults')}
                          </Link>
                        )}
                        <Link
                          href={`/print/lab/${order.id}`}
                          target="_blank"
                          className="inline-block text-xs px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-medium"
                        >
                          🖨️ {tCommon('print')}
                        </Link>
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
