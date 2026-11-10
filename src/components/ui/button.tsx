import Link from 'next/link';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'accent' | 'ghost' | 'invert' | 'danger' | 'plain';

const base =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-field border border-transparent bg-transparent px-4 py-[11px] text-sm leading-none font-extrabold text-brand shadow-card transition duration-150 ease-in-out disabled:cursor-not-allowed disabled:opacity-60 [&_svg]:block';

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-brand text-white hover:not-disabled:-translate-y-px hover:not-disabled:bg-brand-ink hover:not-disabled:shadow-[0_12px_24px_rgb(34_77_143/0.25)]',
  accent:
    'bg-accent text-black hover:not-disabled:-translate-y-px hover:not-disabled:bg-accent-light hover:not-disabled:brightness-95',
  ghost:
    'border-accent text-fg hover:not-disabled:-translate-y-px hover:not-disabled:text-accent',
  invert: 'border-white/45 text-white hover:not-disabled:border-white',
  danger: 'bg-danger text-white hover:not-disabled:-translate-y-px hover:not-disabled:brightness-110',
  plain: '',
};

/** Class string for anything that should look like a button (links included). */
export function buttonStyles(variant: ButtonVariant = 'primary', { wide = false, className }: { wide?: boolean; className?: string } = {}) {
  return cn(base, variants[variant], wide && 'w-full', className);
}

type ButtonProps = ComponentProps<'button'> & { variant?: ButtonVariant; wide?: boolean };

export function Button({ variant = 'primary', wide, className, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={buttonStyles(variant, { wide, className })} {...props} />;
}

type ButtonLinkProps = ComponentProps<typeof Link> & { variant?: ButtonVariant; wide?: boolean };

export function ButtonLink({ variant = 'primary', wide, className, ...props }: ButtonLinkProps) {
  return <Link className={buttonStyles(variant, { wide, className })} {...props} />;
}
