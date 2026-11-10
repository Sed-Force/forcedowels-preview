'use client';

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import {
  CART_EVENT, CART_STORAGE_KEY, cartSubtotalCents, cartUnits, parseCart, type CartItem,
} from '@/lib/cart';

interface CartContextValue {
  items: CartItem[];
  /** False during server render / first paint, before localStorage is readable. */
  ready: boolean;
  totalUnits: number;
  subtotalCents: number;
  setItems: (next: CartItem[]) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

// localStorage is the single source of truth; the raw JSON string is the
// snapshot so React can compare by value and avoid needless re-renders.
function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === CART_STORAGE_KEY || e.key === null) onChange();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(CART_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(CART_EVENT, onChange);
  };
}
const getSnapshot = (): string | null => window.localStorage.getItem(CART_STORAGE_KEY) ?? '[]';
const getServerSnapshot = (): string | null => null;

export function CartProvider({ children }: { children: ReactNode }) {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const ready = raw !== null;
  const items = useMemo(() => parseCart(raw), [raw]);

  const setItems = useCallback((next: CartItem[]) => {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(CART_EVENT));
  }, []);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      ready,
      totalUnits: cartUnits(items),
      subtotalCents: cartSubtotalCents(items),
      setItems,
      clear: () => setItems([]),
    }),
    [items, ready, setItems],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}
