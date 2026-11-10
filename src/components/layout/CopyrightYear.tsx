import { cacheLife } from 'next/cache';

/** Current year, cached so the footer can stay in the static shell. */
export async function CopyrightYear() {
  'use cache';
  cacheLife('days');
  return <>{new Date().getFullYear()}</>;
}
