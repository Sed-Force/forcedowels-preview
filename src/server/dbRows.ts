/* eslint-disable @typescript-eslint/no-explicit-any -- driver rows are untyped; callers narrow the fields they read */
export type Row = Record<string, any>;

export const formatMoney = (cents: unknown): string =>
  (Number(cents || 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

export const formatDate = (value: unknown, month: '2-digit' | 'short' = '2-digit'): string =>
  new Date(value as string).toLocaleDateString('en-US', {
    year: 'numeric',
    month,
    day: month === 'short' ? 'numeric' : '2-digit',
  });
