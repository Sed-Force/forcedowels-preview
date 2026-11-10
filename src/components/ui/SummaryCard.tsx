import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface Row {
  label: string;
  value: string;
  total?: boolean;
}

/** "Order Summary" panel shared by the cart and checkout pages. */
export function SummaryCard({ title = 'Order Summary', rows, children }: { title?: string; rows: Row[]; children?: ReactNode }) {
  return (
    <div className="rounded-card border border-line bg-card p-[18px] shadow-card">
      <h3 className="mb-3 text-xl">{title}</h3>
      <dl className="mb-3">
        {rows.map((row, i) => (
          <div
            key={row.label}
            className={cn(
              'flex items-center justify-between gap-3 border-t border-dashed border-line-strong py-2.5',
              i === 0 && 'border-t-0',
              row.total && 'border-solid text-lg',
            )}
          >
            <dt>{row.label}</dt>
            <dd className={cn('font-extrabold', row.total && 'text-accent')}>{row.value}</dd>
          </div>
        ))}
      </dl>
      {children}
    </div>
  );
}
