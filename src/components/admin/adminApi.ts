'use client';

import { useCallback, useEffect, useState } from 'react';

/** fetch wrapper for /api/admin/*: JSON in/out, bounces to the login page on 401. */
export async function adminFetch<T = Record<string, unknown>>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
    cache: 'no-store',
  });
  if (res.status === 401) {
    // Hard navigation on purpose: drops all in-memory admin state once the session is gone.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = '/admin/login';
    throw new Error('Your session has expired. Please sign in again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || `Request failed (${res.status})`);
  return data as T;
}

interface DataState<T> { data: T | null; error: string | null; loading: boolean }

/** Load JSON from an admin endpoint; `reload()` refetches. */
export function useAdminData<T>(url: string) {
  const [state, setState] = useState<DataState<T>>({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    adminFetch<T>(url)
      .then((data) => !cancelled && setState({ data, error: null, loading: false }))
      .catch((err: Error) => !cancelled && setState({ data: null, error: err.message, loading: false }));
    return () => { cancelled = true; };
  }, [url, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
