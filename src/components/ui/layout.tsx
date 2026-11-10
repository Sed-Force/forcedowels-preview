import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * The one page column: every page, the navbar and the footer use it, so content
 * always shares the same max width and the same left/right gutter. `wide` is the
 * admin column (data tables need the room); the gutter is identical.
 */
export function Container({
  as: Tag = 'div', wide, className, ...props
}: ComponentProps<'div'> & { as?: 'div' | 'nav' | 'header' | 'main'; wide?: boolean }) {
  return <Tag className={cn('mx-auto w-full px-5', wide ? 'max-w-wide' : 'max-w-site', className)} {...props} />;
}

/** Vertical page band. `alt` uses the alternate surface; `flush` drops the top padding. */
export function Section({ alt, flush, className, ...props }: ComponentProps<'section'> & { alt?: boolean; flush?: boolean }) {
  return <section className={cn('py-14', alt && 'bg-page-alt', flush && 'pt-0', className)} {...props} />;
}

/** Orange "Patent Pending"-style tag line. */
export function Eyebrow({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('mt-2 mb-1.5 text-lg font-extrabold text-fg/40', className)} {...props} />;
}

/** Lead paragraph under a page title (line length capped for readability). */
export function Subline({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('mt-0 mb-4 max-w-[780px] text-lg text-fg', className)} {...props} />;
}

/**
 * Title block shared by every page: left-aligned, same spacing, same optional
 * back link / eyebrow / intro line. Follow it with `<Section flush>` content.
 */
export function PageHeader({
  title,
  eyebrow,
  back,
  wide,
  compact,
  children,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  back?: { href: string; label: string };
  wide?: boolean;
  compact?: boolean;
  children?: ReactNode;
}) {
  return (
    <header className={compact ? 'pt-9 pb-5' : 'pt-14 pb-6'}>
      <Container wide={wide}>
        <h1>{title}</h1>
        {back && (
          <p className="mt-[-8px] mb-6 text-sm">
            <Link href={back.href}>{back.label}</Link>
          </p>
        )}
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        {children && <Subline>{children}</Subline>}
      </Container>
    </header>
  );
}
