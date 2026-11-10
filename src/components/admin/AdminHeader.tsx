'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import { buttonStyles } from '@/components/ui/button';
import { Container } from '@/components/ui/layout';
import { navActiveLinkStyles, navDrawer, navLinkStyles } from '@/components/layout/navStyles';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { cn } from '@/lib/cn';
import { AdminLogo } from './AdminLogo';

const LINKS = [
  { href: '/admin', label: 'Orders' },
  { href: '/admin/customers', label: 'Customers' },
  { href: '/admin/distributors', label: 'Distributors' },
  { href: '/admin/sales', label: 'Sales' },
  { href: '/admin/products', label: 'Products' },
];

/** Admin header: the storefront navbar's twin (same bar, links, drawer and theme toggle). */
export function AdminHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLElement>(null);

  // Close the drawer on outside click, Escape, and when growing past the mobile breakpoint.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const mq = window.matchMedia('(min-width: 901px)');
    const onBreakpoint = () => { if (mq.matches) setOpen(false); };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    mq.addEventListener('change', onBreakpoint);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      mq.removeEventListener('change', onBreakpoint);
    };
  }, []);

  const logout = async () => {
    await fetch('/api/admin/auth', { method: 'DELETE' });
    router.replace('/admin/login');
  };

  return (
    <header ref={rootRef} className="sticky top-0 z-[99] border-b border-white/12 bg-brand">
      <Container as="nav" wide aria-label="Admin" className="flex min-h-(--header-h) items-center justify-between gap-x-[18px] max-[900px]:gap-x-2">
        <AdminLogo onClick={() => setOpen(false)} />

        <div id="admin-nav" className={navDrawer(open)}>
          {LINKS.map(({ href, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={cn(navLinkStyles, active && navActiveLinkStyles)}
                aria-current={active ? 'page' : undefined}
                onClick={() => setOpen(false)}
              >
                {label}
              </Link>
            );
          })}

          {/* On mobile the theme toggle and logout live inside the drawer. */}
          <div className="mt-2.5 hidden items-center gap-3 border-t border-brand pt-4 max-[900px]:flex">
            <ThemeToggle className="h-12 w-12 min-w-12 flex-none" />
            <button type="button" className={buttonStyles('invert', { wide: true, className: 'h-12 flex-1' })} onClick={logout}>
              Log Out
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2.5 max-[900px]:gap-1.5">
          <ThemeToggle className="max-[900px]:hidden" />
          <button type="button" className={buttonStyles('invert', { className: 'max-[900px]:hidden' })} onClick={logout}>
            Log Out
          </button>
          <button
            type="button"
            aria-label="Toggle navigation menu"
            aria-expanded={open}
            aria-controls="admin-nav"
            onClick={() => setOpen((o) => !o)}
            className="hidden h-10 w-10 items-center justify-center text-white hover:text-accent max-[900px]:inline-flex"
          >
            {open ? <XMarkIcon aria-hidden="true" className="size-8" /> : <Bars3Icon aria-hidden="true" className="size-8" />}
          </button>
        </div>
      </Container>
    </header>
  );
}
