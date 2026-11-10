'use client';

import { cn } from '@/lib/cn';
import { buttonStyles } from '@/components/ui/button';
import { MoonIcon, SunIcon } from '@heroicons/react/24/solid';

type Theme = 'light' | 'dark';

const icon = 'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 transition-opacity duration-200';

/**
 * Flips between light and dark. The initial theme is applied before first paint
 * by the inline script in the root layout, so this component holds no state:
 * the current theme lives on <html data-theme>, and the `dark:` variant swaps the icon.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const toggle = () => {
    const root = document.documentElement;
    const explicit = root.getAttribute('data-theme') as Theme | null;
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const current: Theme = explicit ?? (systemDark ? 'dark' : 'light');
    const next: Theme = current === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try {
      window.localStorage.setItem('theme', next);
    } catch {
      /* private mode: theme still applies for this visit */
    }
  };

  return (
    <button
      type="button"
      className={cn(buttonStyles('accent'), 'relative h-10 w-10 min-w-10 rounded-full p-0', className)}
      onClick={toggle}
      aria-label="Toggle theme"
    >
      <SunIcon aria-hidden="true" className={cn(icon, 'size-6 opacity-100 dark:opacity-0')} />
      <MoonIcon aria-hidden="true" className={cn(icon, 'size-6 opacity-0 dark:opacity-100')} />
    </button>
  );
}
