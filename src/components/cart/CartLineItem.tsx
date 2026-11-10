'use client';

import { MinusIcon, PlusIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/solid';
import { cn } from '@/lib/cn';
import { clampBulkUnits, clampKitQty, lineTotalCents, type CartItem } from '@/lib/cart';
import { formatMoney, formatNumber, formatUnitPrice } from '@/lib/format';
import { STEP, kitPriceUSD, kitUnits, sizeLabel, unitPriceUSD } from '@/lib/products';

const stepButton = 'grid size-11 shrink-0 place-items-center text-fg-subtle hover:text-accent';

/** One bordered control: minus, an editable (comma-formatted) quantity, plus. */
function QuantityStepper({
  value, step, unit, onChange, className,
}: {
  value: number; step: number; unit: string;
  onChange: (next: number) => void; className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center rounded-[10px] border border-line-strong bg-field focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/40',
        className,
      )}
    >
      <button type="button" className={stepButton} aria-label="Decrease quantity" onClick={() => onChange(value - step)}>
        <MinusIcon aria-hidden="true" className="size-6" />
      </button>
      {/* key remounts the uncontrolled input whenever the committed value changes */}
      <input
        key={value}
        type="text"
        inputMode="numeric"
        defaultValue={formatNumber(value)}
        aria-label={`Quantity in ${unit}`}
        className="h-11 w-0 min-w-0 flex-1 border-0 bg-transparent p-0 text-center font-semibold text-fg shadow-none outline-none"
        onBlur={(e) => onChange(Number(e.target.value.replace(/[^\d]/g, '')))}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      />
      <button type="button" className={stepButton} aria-label="Increase quantity" onClick={() => onChange(value + step)}>
        <PlusIcon aria-hidden="true" className="size-6" />
      </button>
    </div>
  );
}

/**
 * A cart line. Wide: remove | divider | title + unit price, then × quantity,
 * with the line price top-right. Narrow (container <=620px): title row, unit price × quantity, then price.
 * `contents` wrappers let the same elements sit directly on the wide grid or in their own narrow rows.
 */
export function CartLineItem({
  item, onChange, onRemove,
}: { item: CartItem; onChange: (next: CartItem) => void; onRemove: () => void }) {
  const isBulk = item.type === 'bulk';
  const title = isBulk
    ? `Force Dowels — ${sizeLabel(item.sizeId)} Bulk`
    : `Force Dowels — ${sizeLabel(item.sizeId)} Kit (${kitUnits(item.sizeId)})`;
  const unitPrice = isBulk ? formatUnitPrice(unitPriceUSD(item.sizeId, item.units)) : formatMoney(kitPriceUSD(item.sizeId));

  return (
    <li className="grid grid-cols-[auto_1px_minmax(0,1fr)_auto_auto] items-center gap-x-3.5 gap-y-3 rounded-card border border-line bg-card p-5 shadow-card @max-[620px]:grid-cols-[auto_minmax(0,1fr)] @max-[620px]:gap-y-4">
      <div className="contents @max-[620px]:col-span-2 @max-[620px]:flex @max-[620px]:items-stretch @max-[620px]:gap-4">
        <button
          type="button"
          onClick={onRemove}
          className="col-1 row-[1/3] flex flex-col items-center gap-1 self-center p-0 text-[13px] font-bold text-danger-soft @max-[620px]:row-auto @max-[620px]:self-start"
        >
          <TrashIcon aria-hidden="true" className="size-6" />
          Remove
        </button>
        <span aria-hidden="true" className="col-2 row-[1/3] w-px self-stretch bg-line-strong @max-[620px]:row-auto" />
        <div className="col-3 row-1 min-w-0">
          <strong className="block">{title}</strong>
          <div className="text-fg-muted italic">
            {isBulk ? 'Tiered pricing applies automatically' : `${kitUnits(item.sizeId)} units per kit`}
          </div>
        </div>
      </div>

      <div className="col-3 row-2 flex items-center justify-between gap-4 @max-[620px]:col-1 @max-[620px]:flex-col @max-[620px]:items-start @max-[620px]:justify-start @max-[620px]:gap-0.5">
        <span>Unit Price</span>
        <span>{unitPrice}</span>
      </div>

      <div className="contents @max-[620px]:flex @max-[620px]:items-center @max-[620px]:gap-3">
        <XMarkIcon aria-hidden="true" className="col-4 row-2 size-5 text-fg-subtle @max-[620px]:shrink-0" />
        <QuantityStepper
          className="col-5 row-2 min-w-[176px] @max-[620px]:min-w-0 @max-[620px]:flex-1"
          {...(isBulk
            ? { value: item.units, step: STEP, unit: 'units', onChange: (n: number) => onChange({ ...item, units: clampBulkUnits(n) }) }
            : { value: item.qty, step: 1, unit: 'kits', onChange: (n: number) => onChange({ ...item, qty: clampKitQty(n) }) })}
        />
      </div>

      <div className="col-5 row-1 flex items-baseline justify-between gap-4 text-xl font-extrabold @max-[620px]:col-span-2 @max-[620px]:col-start-1 @max-[620px]:row-auto @max-[620px]:border-t @max-[620px]:border-line-strong @max-[620px]:pt-3 @max-[620px]:text-2xl">
        <span>Price</span>
        <span>{formatMoney(lineTotalCents(item) / 100)}</span>
      </div>
    </li>
  );
}
