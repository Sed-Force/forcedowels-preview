'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuthState } from '@/components/providers/AppProviders';
import { useCart } from '@/components/providers/CartProvider';
import { Button, ButtonLink } from '@/components/ui/button';
import { FormStatus } from '@/components/ui/form';
import { Container } from '@/components/ui/layout';
import { KIT_MAX, KIT_MIN, clampBulkUnits, clampKitQty, type CartItem } from '@/lib/cart';
import { cn } from '@/lib/cn';
import { formatMoney, formatUnitPrice } from '@/lib/format';
import {
  DEFAULT_SIZE_ID, MAX_UNITS, MIN_UNITS, STEP, SIZES,
  bulkTotalCents, getSize, kitUnits, pickTier, unitPriceUSD,
  type SizeId,
} from '@/lib/products';
import { useAvailability } from '@/lib/useAvailability';
import { InternationalOrderModal } from './InternationalOrderModal';
import { CheckIcon } from '@heroicons/react/24/outline';

type Mode = 'bulk' | 'kit';

const callout =
  'mb-3.5 rounded-field border border-brand-light border-l-4 border-l-brand bg-brand-tint px-3.5 py-3 text-sm text-fg';

const optionCard =
  'mb-3 grid w-full grid-cols-[1fr_auto] items-center gap-3 rounded-field border border-line bg-card p-4 text-left text-fg transition duration-[120ms] hover:-translate-y-px hover:shadow-[0_10px_22px_rgb(0_0_0/0.18)] max-[560px]:grid-cols-1';
const optionActive = 'border-accent bg-card-alt shadow-[0_12px_24px_rgb(238_173_26/0.12)]';

const stepButton = 'size-10 rounded-[10px] border border-line-strong bg-card-alt text-xl font-extrabold text-fg hover:border-accent';
const priceRow = 'flex items-center justify-between border-t border-dashed border-line-strong py-2.5 [&_strong]:text-xl';

export function OrderConfigurator() {
  const router = useRouter();
  const { isSignedIn } = useAuthState();
  const { items, setItems } = useCart();
  const { checking, isInStock } = useAvailability();

  const [chosenSize, setChosenSize] = useState<SizeId>(DEFAULT_SIZE_ID);
  const [mode, setMode] = useState<Mode>('bulk');
  const [bulkQty, setBulkQty] = useState(MIN_UNITS);
  const [kitQty, setKitQty] = useState(KIT_MIN);
  const [notice, setNotice] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState(false);
  const [intlOpen, setIntlOpen] = useState(false);

  // If the chosen size sells out, fall back to the first size still in stock.
  const sizeId: SizeId = isInStock(chosenSize)
    ? chosenSize
    : (SIZES.find((s) => isInStock(s.id))?.id ?? DEFAULT_SIZE_ID);
  const size = getSize(sizeId);

  // Guests may order up to the unit before the first members-only tier.
  const lockedTier = size.bulkTiers.find((t) => t.requiresAuth);
  const maxBulk = isSignedIn || !lockedTier ? MAX_UNITS : lockedTier.min - STEP;
  const effectiveBulkQty = Math.min(bulkQty, maxBulk);

  const activeTier = pickTier(sizeId, effectiveBulkQty);
  const unitPrice = mode === 'kit' ? size.kit.priceUSD : unitPriceUSD(sizeId, effectiveBulkQty);
  const totalCents =
    mode === 'kit' ? Math.round(size.kit.priceUSD * 100) * kitQty : bulkTotalCents(sizeId, effectiveBulkQty);

  const goToLogin = () => router.push('/login?redirect=/order');

  const selectTier = (minUnits: number) => {
    setMode('bulk');
    setBulkQty(clampBulkUnits(minUnits, maxBulk));
    setNotice(null);
  };

  const stepQty = (direction: 1 | -1) => {
    if (mode === 'kit') setKitQty((q) => clampKitQty(q + direction));
    else setBulkQty(clampBulkUnits(effectiveBulkQty + direction * STEP, maxBulk));
  };

  const addToCart = () => {
    if (!isInStock(sizeId)) {
      setNotice('This size is currently out of stock. Please choose another size.');
      return;
    }

    let next: CartItem[];
    if (mode === 'kit') {
      const line: CartItem = { type: 'kit', sizeId, qty: kitQty };
      next = items.some((i) => i.type === 'kit' && i.sizeId === sizeId)
        ? items.map((i) => (i.type === 'kit' && i.sizeId === sizeId ? line : i))
        : [...items, line];
    } else {
      if (activeTier.requiresAuth && !isSignedIn) {
        setNotice('Please sign in or create an account to order 25,000+ units.');
        goToLogin();
        return;
      }
      const line: CartItem = { type: 'bulk', sizeId, units: effectiveBulkQty };
      next = items.some((i) => i.type === 'bulk' && i.sizeId === sizeId)
        ? items.map((i) => (i.type === 'bulk' && i.sizeId === sizeId ? line : i))
        : [...items, line];
    }

    setItems(next);
    setNotice(null);
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 1500);
  };

  const qtyValue = mode === 'kit' ? kitQty : effectiveBulkQty;

  return (
    <Container className="grid grid-cols-[1.1fr_0.9fr] items-start gap-7 max-[980px]:grid-cols-1" aria-busy={checking}>
      {/* LEFT: size, tiers, kit — dimmed until stock is known so a sold-out size never flashes as selectable. */}
      <div className={cn(checking && 'pointer-events-none opacity-60')}>
        <h2>Select a Size</h2>
        {checking && (
          <p className="mt-0 mb-3 flex items-center gap-2 text-sm text-fg-muted">
            <span aria-hidden="true" className="size-3.5 animate-spin rounded-full border-2 border-line-strong border-t-accent" />
            Checking current availability…
          </p>
        )}

        <div className="mb-6 flex flex-wrap gap-2.5 max-[560px]:flex-col" role="tablist" aria-label="Dowel size">
          {SIZES.map((s) => {
            const inStock = isInStock(s.id);
            const active = s.id === sizeId;
            return (
              <Button
                key={s.id}
                role="tab"
                aria-selected={active}
                disabled={!inStock}
                title={inStock ? undefined : 'Currently out of stock'}
                className={cn(
                  'min-w-[140px] flex-1 flex-col gap-1 px-4 py-3 disabled:line-through',
                  active && 'border-2 border-b-4 border-accent bg-accent text-brand-ink shadow-[0_12px_24px_rgb(238_173_26/0.12)] hover:not-disabled:bg-accent-light',
                )}
                onClick={() => setChosenSize(s.id)}
              >
                <span className="font-extrabold">{s.label}</span>
                {!inStock && <span className="text-xs font-bold opacity-85">Out of Stock</span>}
              </Button>
            );
          })}
        </div>

        <h2>Pricing Tiers</h2>
        <div className={callout}>
          <strong>Guest Checkout Available:</strong> Orders of 5,000–20,000 units and all kit purchases can be
          completed without an account.
        </div>

        <div role="group" aria-label="Bulk pricing tiers">
          {size.bulkTiers.map((tier) => {
            const locked = tier.requiresAuth && !isSignedIn;
            const active = mode === 'bulk' && !locked && tier.min === activeTier.min;
            return (
              <button
                key={tier.min}
                type="button"
                className={cn(optionCard, active && optionActive, locked && 'opacity-75')}
                aria-pressed={active}
                title={locked ? 'Sign in to unlock this pricing tier' : undefined}
                onClick={() => (locked ? goToLogin() : selectTier(tier.min))}
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-extrabold">{tier.label}</span>
                  {locked && (
                    <span className="rounded-full border border-line bg-card-alt px-2 py-0.5 text-[11px] font-extrabold tracking-[0.04em] text-fg-muted uppercase">
                      Members-Only · Sign in
                    </span>
                  )}
                </span>
                <span className="font-extrabold text-brand-light">{formatUnitPrice(tier.unitUSD)}/Unit</span>
              </button>
            );
          })}
        </div>

        <h3 className="mt-4">Or Try Our Starter Kit</h3>
        <button
          type="button"
          className={cn(optionCard, 'bg-card-alt', mode === 'kit' && optionActive)}
          aria-pressed={mode === 'kit'}
          onClick={() => {
            setMode('kit');
            setNotice(null);
          }}
        >
          <span>
            <strong>{size.kit.title} — {size.label}</strong>
            <span className="block text-fg-muted">Perfect for small projects and testing</span>
          </span>
          <span className="text-right max-[560px]:text-left">
            <strong>{formatMoney(size.kit.priceUSD)}</strong>
            <span className="block text-fg-muted">
              {kitUnits(sizeId)} dowels • ${(size.kit.priceUSD / size.kit.units).toFixed(2)}/unit
            </span>
          </span>
        </button>

        <h3 className="mt-4">Need a Custom Quote?</h3>
        <p>For orders exceeding 960,000 units or for special requirements, please contact our sales team.</p>
        <ButtonLink variant="accent" href="/contact">Contact Sales</ButtonLink>

        <h3 className="mt-4">International Orders</h3>
        <p className="mt-0 mb-3 text-sm text-fg-muted">
          Don&apos;t see your country listed? Click here to make an order and request shipping rates.
        </p>
        <Button variant="accent" onClick={() => setIntlOpen(true)}>International Orders</Button>
      </div>

      {/* RIGHT: calculator */}
      <aside
        aria-label="Price calculator"
        className={cn(
          'sticky top-[calc(var(--header-h)+16px)] rounded-card border border-line bg-card p-[18px] shadow-card max-[980px]:static',
          checking && 'pointer-events-none opacity-60',
        )}
      >
        <h2 className="mb-2.5">Calculate Your Price</h2>

        <div className={callout}>
          {mode === 'kit' ? (
            <>
              <strong>Kit Orders:</strong> Each Starter Kit ships {kitUnits(sizeId)} dowels. Choose how many kits
              you&apos;d like below.
            </>
          ) : (
            <>
              <strong>Ordering Requirements:</strong> Orders are available in 5,000-unit increments only. Minimum
              5,000 units, maximum 960,000 units.
            </>
          )}
        </div>

        <div className="mb-3">
          <label htmlFor="qty-units" className="mb-2 block font-extrabold">
            {mode === 'kit' ? 'Quantity (kits)' : 'Quantity (units)'}
          </label>
          <div className="flex items-center gap-2.5">
            <button type="button" className={stepButton} aria-label="Decrease quantity" onClick={() => stepQty(-1)}>–</button>
            <input
              id="qty-units"
              type="number"
              inputMode="numeric"
              value={qtyValue}
              step={mode === 'kit' ? 1 : STEP}
              min={mode === 'kit' ? KIT_MIN : MIN_UNITS}
              max={mode === 'kit' ? KIT_MAX : maxBulk}
              className="w-40 min-w-0 rounded-[10px] border border-line-strong bg-field px-3 py-2.5 text-right text-fg max-[560px]:w-full max-[560px]:flex-1"
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!Number.isFinite(v)) return;
                if (mode === 'kit') setKitQty(Math.min(Math.max(v, 0), KIT_MAX));
                else setBulkQty(Math.min(Math.max(v, 0), MAX_UNITS));
              }}
              onBlur={() => {
                if (mode === 'kit') setKitQty(clampKitQty(kitQty));
                else setBulkQty(clampBulkUnits(bulkQty, maxBulk));
              }}
            />
            <button type="button" className={stepButton} aria-label="Increase quantity" onClick={() => stepQty(1)}>+</button>
            <span className="ml-auto text-fg-subtle">{mode === 'kit' ? 'kits' : 'units'}</span>
          </div>
        </div>

        <div className={priceRow}>
          <span>{mode === 'kit' ? 'Price per kit:' : 'Price per unit:'}</span>
          <strong>{mode === 'kit' ? formatMoney(unitPrice) : formatUnitPrice(unitPrice)}</strong>
        </div>
        <div className={priceRow}>
          <span>Total price:</span>
          <strong>{formatMoney(totalCents / 100)}</strong>
        </div>

        <Button variant="accent" wide className="mt-2" onClick={addToCart} disabled={checking}>
          {justAdded ? (
            <>
              <CheckIcon aria-hidden="true" strokeWidth={3} className="size-4" /> Updated Cart
            </>
          ) : (
            'Add to Cart'
          )}
        </Button>
        {notice && <FormStatus kind="error" role="alert" className="mt-3">{notice}</FormStatus>}
        <p className="mt-2.5 mb-0 text-center"><Link href="/cart">View Cart</Link></p>
      </aside>

      <InternationalOrderModal open={intlOpen} onClose={() => setIntlOpen(false)} isInStock={isInStock} />
    </Container>
  );
}
