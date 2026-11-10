'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { buttonStyles } from '@/components/ui/button';
import { Container } from '@/components/ui/layout';
import { useAuthState } from '@/components/providers/AppProviders';
import { useCart } from '@/components/providers/CartProvider';
import { cn } from '@/lib/cn';
import { navActiveLinkStyles, navDrawer, navLinkStyles, navLogo } from './navStyles';
import { ThemeToggle } from './ThemeToggle';
import { Bars3Icon, ChevronDownIcon, ShoppingCartIcon, XMarkIcon } from '@heroicons/react/24/outline';

const NAV_LINKS = [
  { href: '/', label: 'Home', match: ['/'] },
  { href: '/order', label: 'Order', match: ['/order', '/order-success'] },
  { href: '/videos', label: 'Videos', match: ['/videos'] },
  { href: '/faq', label: 'FAQ', match: ['/faq'] },
  { href: '/contact', label: 'Contact', match: ['/contact'] },
];

const DISTRIBUTOR_LINKS = [
  { href: '/distributors', label: 'Find a Distributor' },
  { href: '/distributor-application', label: 'Become a Distributor' },
];

export function Navbar() {
  const pathname = usePathname();
  const { totalUnits, ready } = useCart();
  const { isSignedIn, signOut } = useAuthState();
  const [navOpen, setNavOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const rootRef = useRef<HTMLElement>(null);

  const closeMenus = () => {
    setNavOpen(false);
    setDropdownOpen(false);
  };

  // Close on outside click, Escape, and when growing past the mobile breakpoint.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setNavOpen(false);
        setDropdownOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setNavOpen(false);
        setDropdownOpen(false);
      }
    };
    const mq = window.matchMedia('(min-width: 901px)');
    const onBreakpoint = () => {
      if (mq.matches) {
        setNavOpen(false);
        setDropdownOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    mq.addEventListener('change', onBreakpoint);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      mq.removeEventListener('change', onBreakpoint);
    };
  }, []);

  const distributorActive = DISTRIBUTOR_LINKS.some((l) => l.href === pathname);
  // A dot on the cart icon signals a non-empty cart (nothing to render before the cart loads).
  const hasItems = ready && totalUnits > 0;

  return (
    <header ref={rootRef} className="sticky top-0 z-[99] border-b border-white/12 bg-brand">
      <Container as="nav" aria-label="Main" className="flex min-h-(--header-h) items-center justify-between gap-x-[18px] max-[900px]:gap-x-2">
        <Link href="/" aria-label="Force Dowel Company home" onClick={closeMenus} className="flex items-center gap-3 leading-[0]">
          <Image src="/images/LOGO_Icon-FullColor@512.png" alt="" width={512} height={512} className={navLogo} priority />
          <Image src="/images/LOGO_Wordmark-White@512.png" alt="Force Dowel Company" width={512} height={129} className={navLogo} priority />
        </Link>

        <div
          id="primary-nav"
          className={navDrawer(navOpen)}
        >
          {NAV_LINKS.map(({ href, label, match }) => {
            const active = match.includes(pathname);
            return (
              <Link
                key={href}
                href={href}
                className={cn(navLinkStyles, active && navActiveLinkStyles)}
                aria-current={active ? 'page' : undefined}
                onClick={closeMenus}
              >
                {label}
              </Link>
            );
          })}

          <div className="group/dd relative max-[900px]:w-full">
            <button
              type="button"
              className={cn(navLinkStyles, distributorActive && navActiveLinkStyles)}
              aria-haspopup="true"
              aria-expanded={dropdownOpen}
              onClick={() => setDropdownOpen((open) => !open)}
            >
              Distributors <ChevronDownIcon aria-hidden="true" strokeWidth={2.5} className="size-3 opacity-85" />
            </button>
            <div
              role="menu"
              className={cn(
                'absolute top-[calc(100%+24px)] right-0 z-30 min-w-[220px] rounded-b-xl border border-brand bg-brand-ink p-2 shadow-[0_10px_30px_rgb(0_0_0/0.15)]',
                'max-[900px]:static max-[900px]:mt-1.5 max-[900px]:mb-1 max-[900px]:min-w-0 max-[900px]:rounded-[10px] max-[900px]:border-0 max-[900px]:bg-brand max-[900px]:p-1.5 max-[900px]:shadow-none',
                dropdownOpen ? 'block' : 'hidden min-[901px]:group-focus-within/dd:block min-[901px]:group-hover/dd:block',
              )}
            >
              {DISTRIBUTOR_LINKS.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  role="menuitem"
                  onClick={closeMenus}
                  className="block rounded-lg px-3 py-2.5 text-white hover:bg-brand hover:text-accent-light max-[900px]:hover:bg-brand-ink"
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>

          {/* On mobile the theme toggle and sign-out live inside the drawer. */}
          <div className="mt-2.5 hidden items-center gap-3 border-t border-brand pt-4 max-[900px]:flex">
            <ThemeToggle className="h-12 w-12 min-w-12 flex-none" />
            
            {isSignedIn && (
              <button type="button" className={buttonStyles('invert', { wide: true, className: 'h-12 flex-1' })} onClick={() => void signOut()}>
                Sign Out
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5 max-[900px]:gap-1.5">
          <Link
            href="/cart"
            aria-label={hasItems ? 'Shopping cart (has items)' : 'Shopping cart'}
            onClick={closeMenus}
            className={buttonStyles('plain', { className: 'max-[900px]:min-w-8 max-[900px]:p-1.5 text-white hover:text-accent-light shadow-none' })}
          >
            <span className="relative inline-flex">
              <ShoppingCartIcon aria-hidden="true" className="size-6" />
              {hasItems && (
                <span
                  aria-hidden="true"
                  className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-accent ring-2 ring-brand"
                />
              )}
            </span>
          </Link>
          
          <ThemeToggle className="max-[900px]:hidden" />


          {isSignedIn && (
            <button type="button" className={buttonStyles('invert', { className: 'max-[900px]:hidden' })} onClick={() => void signOut()}>
              Sign Out
            </button>
          )}

          <button
            type="button"
            aria-label="Toggle navigation menu"
            aria-expanded={navOpen}
            aria-controls="primary-nav"
            onClick={() => setNavOpen((open) => !open)}
            className="hidden h-10 w-10 items-center justify-center text-white hover:text-accent max-[900px]:inline-flex"
          >
            {navOpen ? <XMarkIcon aria-hidden="true" className="size-8" /> : <Bars3Icon aria-hidden="true" className="size-8" />}
          </button>
        </div>
      </Container>
    </header>
  );
}
