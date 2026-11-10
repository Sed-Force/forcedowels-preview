'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useAuthState } from '@/components/providers/AppProviders';
import { Button } from '@/components/ui/button';
import { Field, FormCard, FormNote, FormStatus, Input, Select, Textarea } from '@/components/ui/form';
import { CONTACT } from '@/lib/site';

type Status = { kind: 'idle' } | { kind: 'sending' } | { kind: 'success' } | { kind: 'error'; message: string };

const INQUIRY_TYPES = [
  { value: 'pricing', label: 'Pricing Information' },
  { value: 'product', label: 'Product Questions' },
  { value: 'order', label: 'Place an Order' },
  { value: 'support', label: 'Technical Support' },
  { value: 'other', label: 'Other' },
];

/** Contact form posting to /api/contact. Shared by the home page and the contact page so both collect the same fields. */
export function ContactForm() {
  const { getToken } = useAuthState();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    setStatus({ kind: 'sending' });

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    try {
      const token = await getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    } catch {
      /* signing in is optional for contact requests */
    }

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers,
        body: JSON.stringify(Object.fromEntries(new FormData(form).entries())),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || res.statusText || 'Failed to send');
      form.reset();
      setStatus({ kind: 'success' });
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <FormCard onSubmit={onSubmit} onReset={() => setStatus({ kind: 'idle' })}>
      <Field label="Name"><Input required name="name" type="text" autoComplete="name" /></Field>
      <Field label="Email"><Input required name="email" type="email" autoComplete="email" /></Field>
      <Field label="Phone">
        <Input name="phone" type="tel" autoComplete="tel" placeholder="(555) 123-4567" pattern="^[0-9()+\-.\s]{7,}$" />
      </Field>
      <Field label="Inquiry Type">
        <Select name="inquiryType" defaultValue="">
          <option value="">Select…</option>
          {INQUIRY_TYPES.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </Select>
      </Field>
      <Field label="Message">
        <Textarea required name="message" rows={5} placeholder="How can we help?" />
      </Field>

      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="plain" type="reset" disabled={status.kind === 'sending'} className="text-fg shadow-none hover:not-disabled:text-accent">
          Clear
        </Button>
        <Button variant="accent" type="submit" disabled={status.kind === 'sending'}>
          {status.kind === 'sending' ? 'Sending…' : 'Send Message'}
        </Button>
      </div>

      <FormStatus role="status" kind={status.kind === 'success' ? 'success' : status.kind === 'error' ? 'error' : undefined}>
        {status.kind === 'success' && 'Thanks! Your message was sent successfully.'}
        {status.kind === 'error' && `Something went wrong. Please email ${CONTACT.email}. (${status.message})`}
      </FormStatus>
      <FormNote>By submitting, you agree to our <Link href="/privacy">Privacy Policy</Link>.</FormNote>
    </FormCard>
  );
}
