import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Shared look for text inputs, selects and textareas. */
export const controlStyles =
  'w-full rounded-field border border-line-strong bg-field px-3.5 py-3 font-medium text-fg focus:border-brand focus:outline-2 focus:outline-brand-light';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(controlStyles, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn(controlStyles, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(controlStyles, className)} {...props} />;
}

/** Label + control stack. Wrap an <Input>/<Select>/<Textarea> as children. */
export function Field({ label, required, className, children }: { label: ReactNode; required?: boolean; className?: string; children: ReactNode }) {
  return (
    <label className={cn('grid min-w-0 gap-1.5 font-bold text-fg', className)}>
      <span>
        {label} {required && <b className="text-accent">*</b>}
      </span>
      {children}
    </label>
  );
}

/** A form that sits on a card surface. */
export function FormCard({ className, ...props }: ComponentProps<'form'>) {
  return <form className={cn('grid gap-4 rounded-card border border-line bg-card p-6', className)} {...props} />;
}

/** Inline success / error feedback under a form. */
export function FormStatus({ kind, className, ...props }: ComponentProps<'p'> & { kind?: 'success' | 'error' }) {
  return (
    <p
      className={cn('m-0 text-[0.95rem] font-bold', kind === 'success' && 'text-success', kind === 'error' && 'text-danger', className)}
      {...props}
    />
  );
}

export function FormNote({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('m-0 text-[0.9rem] text-fg-muted', className)} {...props} />;
}
