'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { CONTACT } from '@/lib/site';
import { Button } from '@/components/ui/button';
import { Field as BaseField, FormNote, FormStatus, Input, Select, Textarea } from '@/components/ui/form';
import { CheckCircleIcon } from '@heroicons/react/24/outline';

type Status = { kind: 'idle' } | { kind: 'sending' } | { kind: 'success' } | { kind: 'error'; message: string };

const BUSINESS_TYPES = ['Cabinet Manufacturer', 'Millwork / Fabrication', 'Hardware Distributor', 'Tooling Supplier', 'Other'];
const YEARS = ['< 1 year', '1–3 years', '3–5 years', '5–10 years', '10+ years'];
const VOLUMES = ['5,000–20,000 units', '20,000–160,000 units', '160,000–960,000 units', '960,000+ units'];
const COMPATIBILITY = ['8mm line boring', 'CNC drill/router', 'Other'];

export function DistributorApplicationForm() {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    const data: Record<string, unknown> = {};
    for (const [key, value] of formData.entries()) {
      if (key === 'compatibility') {
        ((data.compatibility ??= []) as string[]).push(String(value));
      } else if (key !== 'agree') {
        data[key] = value;
      }
    }

    setStatus({ kind: 'sending' });
    try {
      const res = await fetch('/api/distributor-app', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || !result.ok) throw new Error(result.error || 'Unknown error');
      form.reset();
      setStatus({ kind: 'success' });
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
    }
  };

  return (
    <>
      {status.kind === 'success' && (
        <div role="status" className="mb-6 rounded-field bg-success p-5 text-center text-white [&_h3]:mb-2 [&_h3]:text-xl [&_p]:m-0">
          <h3 className="inline-flex items-center gap-2">
            Application Submitted Successfully!
            <CheckCircleIcon aria-hidden="true" className="size-6" />
          </h3>
          <p>Thank you for your interest in becoming a Force Dowels distributor. A representative will contact you shortly.</p>
        </div>
      )}

      <form className="grid gap-5 [&_fieldset]:m-0 [&_fieldset]:min-w-0 [&_fieldset]:rounded-card [&_fieldset]:border [&_fieldset]:border-line [&_fieldset]:bg-card [&_fieldset]:p-5 [&_legend]:px-2 [&_legend]:text-lg [&_legend]:font-extrabold [&_legend]:text-accent" onSubmit={onSubmit}>
        <fieldset>
          <legend>Company &amp; Contact</legend>
          <div className="grid grid-cols-2 gap-4 max-[640px]:grid-cols-1">
            <BaseField label="Company Name" required><Input required name="company" autoComplete="organization" /></BaseField>
            <BaseField label="Website"><Input name="website" type="url" placeholder="https://" /></BaseField>
            <BaseField label="Primary Contact (First & Last)" required><Input required name="contact_name" autoComplete="name" /></BaseField>
            <BaseField label="Title / Role"><Input name="title" autoComplete="organization-title" /></BaseField>
            <BaseField label="Work Email" required><Input required name="email" type="email" autoComplete="email" /></BaseField>
            <BaseField label="Phone"><Input name="phone" type="tel" autoComplete="tel" /></BaseField>
          </div>
        </fieldset>

        <fieldset>
          <legend>Business Address</legend>
          <div className="grid grid-cols-2 gap-4 max-[640px]:grid-cols-1">
            <BaseField label="Street" className="col-span-full"><Input name="street" autoComplete="address-line1" /></BaseField>
            <BaseField label="City"><Input name="city" autoComplete="address-level2" /></BaseField>
            <BaseField label="State / Province"><Input name="state" autoComplete="address-level1" /></BaseField>
            <BaseField label="ZIP / Postal Code"><Input name="zip" autoComplete="postal-code" /></BaseField>
            <BaseField label="Country"><Input name="country" autoComplete="country-name" /></BaseField>
          </div>
        </fieldset>

        <fieldset>
          <legend>Business Profile</legend>
          <div className="grid grid-cols-2 gap-4 max-[640px]:grid-cols-1">
            <BaseField label="Business Type">
              <Select name="business_type" defaultValue="">
                <option value="">Select…</option>
                {BUSINESS_TYPES.map((o) => <option key={o}>{o}</option>)}
              </Select>
            </BaseField>
            <BaseField label="Years in Business">
              <Select name="years_in_business" defaultValue="">
                <option value="">Select…</option>
                {YEARS.map((o) => <option key={o}>{o}</option>)}
              </Select>
            </BaseField>
            <BaseField label="Resale / Tax ID"><Input name="resale_tax_id" /></BaseField>
            <BaseField label="Estimated Monthly Volume">
              <Select name="monthly_volume" defaultValue="">
                <option value="">Select…</option>
                {VOLUMES.map((o) => <option key={o}>{o}</option>)}
              </Select>
            </BaseField>
            <BaseField label="Territories / Regions Covered" className="col-span-full">
              <Input name="territory" placeholder="e.g., Arizona, Nevada, SoCal" />
            </BaseField>
          </div>

          <div className="mt-4 grid gap-2">
            <span className="font-bold">Dowel System Compatibility</span>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {COMPATIBILITY.map((o) => (
                <label key={o} className="inline-flex items-center gap-2 font-medium"><input type="checkbox" name="compatibility" value={o} /> {o}</label>
              ))}
            </div>
          </div>
          <FormNote>
            To provide a resale certificate, email it to <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a> after
            submitting your application.
          </FormNote>
        </fieldset>

        <fieldset>
          <legend>Additional Notes</legend>
          <label className="grid gap-1.5 font-bold">
            <span className="sr-only">Additional Notes</span>
            <Textarea name="notes" rows={5} placeholder="Tell us anything helpful about your business, timelines, or requirements." />
          </label>
        </fieldset>

        <div className="flex flex-wrap items-center justify-between gap-5">
          <label className="flex flex-[1_1_320px] items-start gap-2.5 text-sm">
            <input required type="checkbox" name="agree" className="mt-1" />
            <span>I agree that the information provided is accurate and understand a Force Dowels representative will contact me.</span>
          </label>
          <Button variant="accent" type="submit" className="max-[640px]:w-full" disabled={status.kind === 'sending'}>
            {status.kind === 'sending' ? 'Submitting…' : 'Submit Application'}
          </Button>
        </div>

        {status.kind === 'error' && (
          <FormStatus kind="error" role="alert">
            Sorry, something went wrong. Please try again or email {CONTACT.email} directly. ({status.message})
          </FormStatus>
        )}
        <FormNote>
          By submitting, you agree to our <Link href="/privacy">Privacy Policy</Link> and <Link href="/terms">Terms of Service</Link>.
        </FormNote>
      </form>
    </>
  );
}
