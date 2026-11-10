'use client';

import { useEffect, useState } from 'react';
import { SIZES, normalizeSizeId, type SizeId } from './products';

export type AvailabilityMap = Record<SizeId, boolean>;

const allInStock = (): AvailabilityMap =>
  Object.fromEntries(SIZES.map((s) => [s.id, true])) as AvailabilityMap;

const TIMEOUT_MS = 3000;

/**
 * Loads per-size stock from /api/product-availability.
 * Bounded by a timeout and fails open (everything in stock) so a slow or
 * unreachable API can never block ordering; checkout re-validates server-side.
 */
export function useAvailability() {
  const [state, setState] = useState<{ checking: boolean; map: AvailabilityMap }>({
    checking: true,
    map: allInStock(),
  });

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);

    fetch('/api/product-availability', { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('bad response'))))
      .then((data: { availability?: Partial<Record<string, boolean>> }) => {
        const map = allInStock();
        for (const [id, inStock] of Object.entries(data.availability ?? {})) {
          map[normalizeSizeId(id)] = inStock !== false;
        }
        setState({ checking: false, map });
      })
      .catch(() => setState((prev) => ({ ...prev, checking: false })))
      .finally(() => window.clearTimeout(timer));

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, []);

  const isInStock = (id: unknown) => state.map[normalizeSizeId(id)] !== false;
  return { checking: state.checking, availability: state.map, isInStock };
}
