'use client';

import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useCart } from '@/components/providers/CartProvider';
import { ButtonLink } from '@/components/ui/button';

interface Summary {
  short_id: string;
  payment_status: string;
  amount_formatted: string;
  customer_email: string;
  items: Array<{ name: string; desc: string; qty: number }>;
}

type State = { kind: 'loading' } | { kind: 'ready'; summary: Summary } | { kind: 'error' };

/** Order confirmation shown after Stripe redirects back with ?session_id=… */
export function OrderConfirmation() {
  const sessionId = useSearchParams().get('session_id');
  const { clear } = useCart();
  const [state, setState] = useState<State>(sessionId ? { kind: 'loading' } : { kind: 'error' });

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    fetch(`/api/order-summary?session_id=${encodeURIComponent(sessionId)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Failed to load order summary'))))
      .then((summary: Summary) => {
        if (cancelled) return;
        setState({ kind: 'ready', summary });
        // The order is placed, so the cart is no longer needed.
        if (summary.payment_status === 'paid') clear();
      })
      .catch((err) => {
        console.error('Order summary failed:', err);
        if (!cancelled) setState({ kind: 'error' });
      });

    return () => { cancelled = true; };
    // `clear` is stable per cart snapshot; the session id is the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return (
    <div className="max-w-[720px] rounded-card border border-line bg-card p-7 shadow-card">
      <span className="mb-2 inline-flex h-[34px] items-center rounded-full bg-brand px-3.5">
        <Image src="/images/LOGO_Wordmark+Icon-WhiteAccent@1024.png" alt="Force Dowels" width={1024} height={258} className="h-5 w-auto" />
      </span>

      {state.kind === 'loading' && <p className="text-fg-muted" aria-live="polite">Loading your order…</p>}

      {state.kind === 'error' && (
        <p className="text-fg-muted">
          Thank you! Your payment was received and a receipt has been emailed to you. We couldn&apos;t load the order
          details right now.
        </p>
      )}

      {state.kind === 'ready' && (
        <>
          <p className="text-fg-muted">Your payment was successful. A receipt has been emailed to you.</p>
          <ul className="my-5 grid list-none gap-0 overflow-hidden rounded-field border border-line p-0 [&>li]:flex [&>li]:justify-between [&>li]:gap-4 [&>li]:border-b [&>li]:border-line [&>li]:px-4 [&>li]:py-3 [&>li:last-child]:border-b-0 [&_span]:text-fg-muted [&_strong]:text-right [&_strong]:break-words">
            <li><span>Order</span><strong>{state.summary.short_id || '—'}</strong></li>
            <li><span>Status</span><strong>{(state.summary.payment_status || '—').toUpperCase()}</strong></li>
            <li><span>Amount</span><strong>{state.summary.amount_formatted || '—'}</strong></li>
            <li><span>Email</span><strong>{state.summary.customer_email || '—'}</strong></li>
          </ul>
          <div className="rounded-field border border-line bg-card-alt p-4 [&_p]:m-0 [&_p]:mb-1.5">
            <h3 className="mb-2">Items</h3>
            {state.summary.items.length === 0 && <p className="text-fg-muted">No items found.</p>}
            {state.summary.items.map((item, i) => (
              <p key={i}>
                {item.name}
                {item.desc ? ` — ${item.desc}` : ''}
                {item.qty > 1 ? ` (x${item.qty})` : ''}
              </p>
            ))}
          </div>
        </>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <ButtonLink variant="accent" href="/order">Order More</ButtonLink>
        <ButtonLink variant="ghost" href="/">Back to Home</ButtonLink>
      </div>
    </div>
  );
}
