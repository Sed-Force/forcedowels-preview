import type { ComponentProps, ReactNode } from 'react';
import { Button, buttonStyles, type ButtonVariant } from '@/components/ui/button';
import { cardStyles } from '@/components/ui/card';
import { controlStyles } from '@/components/ui/form';
import { Container, PageHeader, Section } from '@/components/ui/layout';
import { cn } from '@/lib/cn';

/*
 * Admin building blocks. They are thin layers over the storefront primitives
 * (Button, Card, form controls, PageHeader) so both sides share one look.
 */

// ── Page frame ─────────────────────────────────────────────────────────────
/** Title block + content column for every admin screen (same gutters as the header). */
export function AdminPage({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <>
      <PageHeader title={title} wide compact>{intro}</PageHeader>
      <Section flush>
        <Container wide>{children}</Container>
      </Section>
    </>
  );
}

// ── Buttons ────────────────────────────────────────────────────────────────
// Primary actions use the storefront's gold CTA; secondary actions the outlined button.
type AdminButtonVariant = 'default' | 'primary' | 'danger';
const variantMap: Record<AdminButtonVariant, ButtonVariant> = { default: 'ghost', primary: 'accent', danger: 'danger' };

export const adminButtonStyles = (variant: AdminButtonVariant = 'default', className?: string) =>
  buttonStyles(variantMap[variant], { className });

export function AdminButton({ variant = 'default', ...props }: ComponentProps<'button'> & { variant?: AdminButtonVariant }) {
  return <Button variant={variantMap[variant]} {...props} />;
}

// ── Status badge ───────────────────────────────────────────────────────────
// Status tones are fixed (not themed): the same pastel pills read well on light and dark surfaces.
const warn = 'bg-[#fef3c7] text-[#92400e]';
const ok = 'bg-[#d1fae5] text-[#065f46]';
const bad = 'bg-[#fee2e2] text-[#991b1b]';

const badgeTones: Record<string, string> = {
  pending: warn,
  shipped: ok,
  completed: ok,
  paid: ok,
  approved: ok,
  instock: ok,
  cancelled: bad,
  rejected: bad,
  outstock: bad,
};

export function Badge({ status, children }: { status: string; children?: ReactNode }) {
  return (
    <span className={cn('inline-block rounded-full px-2.5 py-0.5 text-xs font-extrabold capitalize', badgeTones[status])}>
      {children ?? status}
    </span>
  );
}

// ── Cards and detail lists ─────────────────────────────────────────────────
export function AdminCard({ title, aside, children }: { title: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <article className={cn(cardStyles, 'mb-4 p-5 max-[720px]:p-4')}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <h3 className="m-0 min-w-0 break-words">{title}</h3>
        {aside}
      </div>
      {children}
    </article>
  );
}

export function MetaList({ children }: { children: ReactNode }) {
  return (
    <dl className="my-4 grid grid-cols-[repeat(auto-fill,minmax(min(220px,100%),1fr))] gap-x-5 gap-y-3 text-sm">{children}</dl>
  );
}

export function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs tracking-[0.04em] text-fg-muted uppercase">{label}</dt>
      <dd className="m-0 break-words whitespace-pre-line">{children}</dd>
    </div>
  );
}

export const Actions = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-wrap gap-2.5 max-[480px]:[&>*]:flex-[1_1_100%]">{children}</div>
);

// ── Filters, states ────────────────────────────────────────────────────────
/** Compact version of the storefront field style for toolbars. */
export const adminControl = cn(controlStyles, 'w-auto py-2.5');

/** Toolbar row; on phones every control takes a full row. */
export function Filters({ children }: { children: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-3.5 gap-y-2.5 max-[720px]:[&>*]:w-full [&_label]:font-bold">{children}</div>
  );
}

export const Spacer = () => <span className="flex-1 max-[720px]:hidden" />;

/** Result of the last action (saved, shipped, error…). */
export function Notice({ children }: { children: ReactNode }) {
  return <p role="status" className="m-0 mb-4 rounded-field border border-line bg-card px-4 py-2.5 text-sm font-bold text-fg">{children}</p>;
}

export function StateMessage({ tone, children }: { tone?: 'error'; children: ReactNode }) {
  return (
    <p role={tone === 'error' ? 'alert' : undefined} className={cn('py-10 text-center', tone === 'error' ? 'text-danger-soft font-bold' : 'text-fg-muted')}>
      {children}
    </p>
  );
}

// ── Tables ─────────────────────────────────────────────────────────────────
/** A table cell that carries its column name, shown inline once the table stacks into cards. */
export function Td({ label, className, ...props }: ComponentProps<'td'> & { label: string }) {
  return <td data-label={label} className={className} {...props} />;
}

const stacked = [
  '@max-[640px]:block',
  '@max-[640px]:[&_thead]:sr-only',
  '@max-[640px]:[&_tbody]:block',
  '@max-[640px]:[&_tr]:block @max-[640px]:[&_tr]:border-b @max-[640px]:[&_tr]:border-line @max-[640px]:[&_tr]:py-2.5 @max-[640px]:[&_tr:last-child]:border-b-0',
  '@max-[640px]:[&_td]:flex @max-[640px]:[&_td]:items-center @max-[640px]:[&_td]:justify-between @max-[640px]:[&_td]:gap-4 @max-[640px]:[&_td]:border-b-0 @max-[640px]:[&_td]:px-4 @max-[640px]:[&_td]:py-1.5 @max-[640px]:[&_td]:text-right',
  '@max-[640px]:[&_td]:before:text-left @max-[640px]:[&_td]:before:text-xs @max-[640px]:[&_td]:before:font-bold @max-[640px]:[&_td]:before:tracking-[0.04em] @max-[640px]:[&_td]:before:text-fg-muted @max-[640px]:[&_td]:before:uppercase @max-[640px]:[&_td]:before:content-[attr(data-label)]',
].join(' ');

/** Data table that becomes a stack of labelled cards when its container is narrow. Use <Td label>. */
export function TableWrap({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('@container overflow-x-auto rounded-card border border-line bg-card shadow-card', className)}>
      <table
        className={cn(
          'w-full border-collapse text-sm [&_td]:border-b [&_td]:border-line [&_td]:px-4 [&_td]:py-3 [&_td]:align-top [&_th]:border-b [&_th]:border-line [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:align-top [&_th]:text-xs [&_th]:tracking-[0.04em] [&_th]:whitespace-nowrap [&_th]:text-fg-muted [&_th]:uppercase [&_tr:last-child_td]:border-b-0 [&_.num]:text-right [&_.num]:whitespace-nowrap',
          stacked,
        )}
      >
        {children}
      </table>
    </div>
  );
}

/** Metric tile (Sales page). */
export function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className={cn(cardStyles, 'p-5')}>
      <span className="block text-[13px] font-bold tracking-[0.04em] text-fg-muted uppercase">{label}</span>
      <strong className="block text-3xl font-extrabold">{value}</strong>
    </div>
  );
}

/** On/off switch built on a real checkbox (keyboard + screen-reader friendly). */
export function Switch({ checked, disabled, onChange, children }: { checked: boolean; disabled?: boolean; onChange: (next: boolean) => void; children?: ReactNode }) {
  return (
    <label className={cn('inline-flex items-center gap-3 font-bold', disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer')}>
      <input type="checkbox" role="switch" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden="true"
        className="relative h-6 w-11 shrink-0 rounded-full bg-line-strong transition-colors duration-150 after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform after:duration-150 peer-checked:bg-success peer-checked:after:translate-x-5 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent"
      />
      {children}
    </label>
  );
}

// ── Forms (modals) ─────────────────────────────────────────────────────────
export function FormGrid({ className, ...props }: ComponentProps<'form'>) {
  return <form className={cn('grid gap-4', className)} {...props} />;
}

export const ModalActions = ({ children }: { children: ReactNode }) => (
  <div className="mt-2 flex justify-end gap-2.5 max-[480px]:flex-col-reverse max-[480px]:[&>*]:w-full">{children}</div>
);
