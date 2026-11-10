'use client';

import { useState } from 'react';
import { useCart } from '@/components/providers/CartProvider';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CartLineItem } from './CartLineItem';
import { SummaryCard } from '@/components/ui/SummaryCard';
import { consolidateCart, type CartItem } from '@/lib/cart';
import { formatMoney, formatNumber } from '@/lib/format';

export function CartView() {
  const { items, ready, setItems, clear, subtotalCents } = useCart();
  const [confirmingClear, setConfirmingClear] = useState(false);

  const update = (index: number, next: CartItem) => setItems(items.map((item, i) => (i === index ? next : item)));
  const remove = (index: number) => setItems(items.filter((_, i) => i !== index));

  if (!ready) {
    return <p className="m-0 text-fg-muted" aria-live="polite">Loading your cart…</p>;
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_340px] items-start gap-7 max-[980px]:grid-cols-1">
      <div>
        {items.length === 0 ? (
          <Card className="grid justify-items-start gap-4">
            <p className="m-0 text-fg-muted">Your cart is empty.</p>
            <ButtonLink href="/order" variant="accent">Browse Products</ButtonLink>
          </Card>
        ) : (
          <>
            <ul className="@container m-0 grid list-none gap-4 p-0">
              {items.map((item, index) => (
                <CartLineItem
                  key={`${item.type}-${item.sizeId}`}
                  item={item}
                  onChange={(next) => update(index, next)}
                  onRemove={() => remove(index)}
                />
              ))}
            </ul>

            <div className="mt-4 flex flex-wrap items-center gap-2.5 max-[680px]:*:flex-[1_1_140px]">
              <ButtonLink href="/order" variant="accent">Add More Items</ButtonLink>
              <span className="flex-1 max-[680px]:hidden" />
              <Button variant="ghost" onClick={() => setItems(consolidateCart(items))}>Consolidate</Button>
              {confirmingClear ? (
                <>
                  <Button variant="primary" onClick={() => { clear(); setConfirmingClear(false); }}>Yes, clear cart</Button>
                  <Button variant="ghost" onClick={() => setConfirmingClear(false)}>Cancel</Button>
                </>
              ) : (
                <Button variant="ghost" onClick={() => setConfirmingClear(true)}>Clear Cart</Button>
              )}
            </div>
          </>
        )}
      </div>

      <aside className="sticky top-[calc(var(--header-h)+16px)] max-[980px]:static [&_p]:m-0 [&_p]:mb-3 [&_p]:text-sm">
        <SummaryCard rows={[{ label: 'Subtotal', value: formatMoney(subtotalCents / 100) }]}>
          <p className="text-fg-muted">Shipping &amp; taxes calculated on the next step.</p>
          {items.length > 0 ? (
            <ButtonLink href="/checkout" variant="accent" wide>Proceed to Checkout</ButtonLink>
          ) : (
            <Button variant="accent" wide disabled>Proceed to Checkout</Button>
          )}
          {items.length > 0 && (
            <p className="text-fg-muted">{formatNumber(items.length)} line item{items.length > 1 ? 's' : ''} in your cart.</p>
          )}
        </SummaryCard>
      </aside>
    </div>
  );
}
