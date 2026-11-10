'use client';

import { useState } from 'react';
import { useAdminData } from './adminApi';
import { Badge, Filters, StatTile, StateMessage, TableWrap, Td, adminControl } from './ui';

interface Sales {
  metrics: { totalRevenue: string; totalOrders: number; totalItems: number; averageOrderValue: string };
  chartData: Array<{
    date: string; revenue: string; orders: number;
    orderDetails: Array<{ invoice_number: number; customer_name: string; items_summary: string; status: string; amount: string }>;
  }>;
}

const PERIODS = [
  { value: 'day', label: 'Last 24 hours' }, { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'Last 30 days' }, { value: 'year', label: 'Last 365 days' }, { value: 'all', label: 'All time' },
];

const usd = (v: string | number) => Number(v).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export function SalesPanel() {
  const [period, setPeriod] = useState('month');
  const { data, loading, error } = useAdminData<Sales>(`/api/admin/sales-analytics?period=${period}`);
  const maxRevenue = Math.max(1, ...(data?.chartData ?? []).map((d) => Number(d.revenue)));

  return (
    <>
      <Filters>
        <label htmlFor="period">Period:</label>
        <select id="period" className={adminControl} value={period} onChange={(e) => setPeriod(e.target.value)}>
          {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </Filters>

      {loading && <StateMessage>Loading sales…</StateMessage>}
      {error && <StateMessage tone="error">{error}</StateMessage>}

      {data && (
        <>
          <div className="mb-6 grid grid-cols-[repeat(auto-fit,minmax(min(150px,100%),1fr))] gap-4">
            <StatTile label="Total revenue" value={usd(data.metrics.totalRevenue)} />
            <StatTile label="Orders" value={String(data.metrics.totalOrders)} />
            <StatTile label="Units sold" value={data.metrics.totalItems.toLocaleString()} />
            <StatTile label="Average order" value={usd(data.metrics.averageOrderValue)} />
          </div>

          <div className="mb-6 grid gap-1.5" role="img" aria-label="Revenue by day">
            {data.chartData.slice(0, 31).map((d) => (
              <div key={d.date} className="grid grid-cols-[110px_1fr_110px] items-center gap-2.5 text-[13px] max-[720px]:grid-cols-[90px_1fr_80px]">
                <span>{new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}</span>
                <div className="h-3.5 min-w-0.5 rounded-full bg-accent" style={{ width: `${(Number(d.revenue) / maxRevenue) * 100}%` }} />
                <strong>{usd(d.revenue)}</strong>
              </div>
            ))}
          </div>

          <TableWrap>
            <thead><tr><th>Date</th><th>Order</th><th>Customer</th><th>Items</th><th>Status</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {data.chartData.flatMap((day) => day.orderDetails.map((o) => (
                <tr key={o.invoice_number}>
                  <Td label="Date">{new Date(day.date).toLocaleDateString('en-US')}</Td><Td label="Order">#{o.invoice_number}</Td>
                  <Td label="Customer">{o.customer_name}</Td><Td label="Items">{o.items_summary}</Td>
                  <Td label="Status"><Badge status={o.status} /></Td>
                  <Td label="Amount" className="num">{usd(o.amount)}</Td>
                </tr>
              )))}
            </tbody>
          </TableWrap>
        </>
      )}
    </>
  );
}
