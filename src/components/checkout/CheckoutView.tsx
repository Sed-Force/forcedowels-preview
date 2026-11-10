'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { useCart } from '@/components/providers/CartProvider';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, FormStatus, Input, Select } from '@/components/ui/form';
import { cn } from '@/lib/cn';
import { SummaryCard } from '@/components/ui/SummaryCard';
import { formatMoney } from '@/lib/format';
import { COUNTRIES, regionsFor, type CountryCode } from './regions';

const DEST_STORAGE_KEY = 'fd_dest';

interface Destination {
  country: CountryCode;
  state: string;
  city: string;
  postal: string;
  street: string;
}

interface Rate {
  id: string;
  carrier: string;
  service: string;
  amount: number;
  estDays: number | null;
}

interface CarrierIssue { carrier: string; error: string }

const EMPTY_DEST: Destination = { country: 'US', state: '', city: '', postal: '', street: '' };

function loadSavedDestination(): Destination {
  try {
    const saved = JSON.parse(window.localStorage.getItem(DEST_STORAGE_KEY) || '{}');
    const country = (COUNTRIES.some((c) => c.code === saved.country) ? saved.country : 'US') as CountryCode;
    const state = String(saved.state || '').toUpperCase();
    return {
      country,
      state: regionsFor(country).includes(state) ? state : '',
      city: String(saved.city || ''),
      postal: String(saved.postal || ''),
      street: String(saved.street || ''),
    };
  } catch {
    return EMPTY_DEST;
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, ms = 25000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

function CheckoutForm() {
  const { items, subtotalCents } = useCart();
  const formRef = useRef<HTMLFormElement>(null);
  const [dest, setDest] = useState<Destination>(loadSavedDestination);
  const [contact, setContact] = useState({ company: '', name: '', email: '', phone: '' });
  const [rates, setRates] = useState<Rate[]>([]);
  const [issues, setIssues] = useState<CarrierIssue[]>([]);
  const [selectedRateId, setSelectedRateId] = useState<string | null>(null);
  const [loadingRates, setLoadingRates] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedRate = rates.find((r) => r.id === selectedRateId) ?? null;
  const subtotal = subtotalCents / 100;

  const clearRates = () => {
    setRates([]);
    setIssues([]);
    setSelectedRateId(null);
  };

  const onDestChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setDest((prev) => {
      const next = { ...prev, [name]: value } as Destination;
      // Switching country invalidates the chosen state/province.
      if (name === 'country') next.state = '';
      return next;
    });
    clearRates(); // a changed address invalidates any quoted rates
  };

  const onContactChange = (e: ChangeEvent<HTMLInputElement>) =>
    setContact((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const getRates = async () => {
    setError(null);
    clearRates();
    if (!formRef.current?.reportValidity()) return;

    window.localStorage.setItem(DEST_STORAGE_KEY, JSON.stringify(dest));
    setLoadingRates(true);
    try {
      const res = await fetchWithTimeout('/api/shipping/rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: dest, items }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.details || body.error || 'Could not get shipping rates. Please try again.');
      }
      const data = await res.json();
      const quoted: Rate[] = (data.rates ?? [])
        .map((r: { id?: string; carrier: string; service: string; priceCents: number; estDays?: number | null }, i: number) => ({
          id: r.id || `${r.carrier}-${r.service}-${i}`,
          carrier: r.carrier,
          service: r.service,
          amount: r.priceCents / 100,
          estDays: r.estDays ?? null,
        }))
        .sort((a: Rate, b: Rate) => a.amount - b.amount);

      setRates(quoted);
      setIssues(Array.isArray(data.errors) ? data.errors : []);
      setSelectedRateId(quoted[0]?.id ?? null); // cheapest first
      if (quoted.length === 0) setError('No shipping rates were available for this address.');
    } catch (err) {
      setError(
        err instanceof DOMException && err.name === 'AbortError'
          ? 'Timed out getting rates. Please try again.'
          : err instanceof Error ? err.message : 'Network error getting rates.',
      );
    } finally {
      setLoadingRates(false);
    }
  };

  const proceedToPayment = async () => {
    setError(null);
    if (!formRef.current?.reportValidity()) return;
    if (!selectedRate) {
      setError('Please choose a shipping option first.');
      return;
    }

    window.localStorage.setItem(DEST_STORAGE_KEY, JSON.stringify(dest));
    setPaying(true);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items,
          customerEmail: contact.email.trim(),
          customerPhone: contact.phone.trim(),
          customerName: contact.company.trim(), // company is the primary name
          contactName: contact.name.trim(),
          shippingAddress: {
            name: contact.company.trim() || contact.email.trim(),
            line1: dest.street,
            city: dest.city,
            state: dest.state,
            postal_code: dest.postal,
            country: dest.country,
          },
          shipping: {
            carrier: selectedRate.carrier,
            service: selectedRate.service,
            amount: selectedRate.amount,
            currency: 'USD',
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'A server error occurred creating your checkout. Please try again.');
      if (!data.url) throw new Error('Could not start checkout. Please try again.');
      window.location.assign(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error creating checkout. Please try again.');
      setPaying(false);
    }
  };

  if (items.length === 0) {
    return (
      <Card className="grid justify-items-start gap-4">
        <p className="m-0">Your cart is empty.</p>
        <ButtonLink href="/order" variant="accent">Browse Products</ButtonLink>
      </Card>
    );
  }

  const regions = regionsFor(dest.country);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_360px] items-start gap-7 max-[980px]:grid-cols-1">
      <div className="grid gap-5">
        <Card>
          <h3>Shipping Address</h3>
          <form ref={formRef} className="grid grid-cols-2 gap-4 max-[560px]:grid-cols-1" onSubmit={(e) => e.preventDefault()}>
            <Field label="Company Name" required>
              <Input name="company" required autoComplete="organization" placeholder="Your Company Name" value={contact.company} onChange={onContactChange} />
            </Field>
            <Field label="Contact Name" required>
              <Input name="name" required autoComplete="name" placeholder="Contact Person Name" value={contact.name} onChange={onContactChange} />
            </Field>
            <Field label="Email Address" required>
              <Input type="email" name="email" required autoComplete="email" placeholder="your@email.com" value={contact.email} onChange={onContactChange} />
            </Field>
            <Field label="Phone Number" required>
              <Input type="tel" name="phone" required autoComplete="tel" placeholder="(555) 555-5555" value={contact.phone} onChange={onContactChange} />
            </Field>
            <Field label="Country" required>
              <Select name="country" required value={dest.country} onChange={onDestChange}>
                {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="State / Province" required>
              <Select name="state" required value={dest.state} onChange={onDestChange}>
                <option value="">Select…</option>
                {regions.map((r) => <option key={r} value={r}>{r}</option>)}
              </Select>
            </Field>
            <Field label="City" required>
              <Input name="city" required autoComplete="address-level2" placeholder="City" value={dest.city} onChange={onDestChange} />
            </Field>
            <Field label="ZIP / Postal" required>
              <Input name="postal" required autoComplete="postal-code" placeholder="85142" value={dest.postal} onChange={onDestChange} />
            </Field>
            <Field label="Street Address" required className="col-span-full">
              <Input name="street" required autoComplete="address-line1" placeholder="Street address" value={dest.street} onChange={onDestChange} />
            </Field>
            <div className="col-span-full">
              <Button variant="primary" onClick={getRates} disabled={loadingRates}>
                {loadingRates ? 'Getting rates…' : 'Get Rates'}
              </Button>
            </div>
          </form>
        </Card>

        <Card>
          <h3>Shipping Options</h3>
          <ul className="m-0 grid list-none gap-2.5 p-0" aria-live="polite">
            {rates.length === 0 && (
              <li className="text-fg-muted">
                {loadingRates ? 'Looking up carrier rates…' : 'No rates yet. Enter an address and click Get Rates.'}
              </li>
            )}
            {rates.map((rate) => {
              const selected = rate.id === selectedRateId;
              return (
                <li
                  key={rate.id}
                  className={cn(
                    'rounded-field border bg-card-alt transition duration-[120ms]',
                    selected ? 'border-accent shadow-[0_8px_20px_rgb(238_173_26/0.14)]' : 'border-line',
                  )}
                >
                  <label className="grid cursor-pointer grid-cols-[auto_auto_1fr_auto] items-center gap-3 px-4 py-3.5 max-[560px]:grid-cols-[auto_1fr_auto]">
                    <input type="radio" name="shiprate" checked={selected} onChange={() => setSelectedRateId(rate.id)} />
                    <span className="font-extrabold max-[560px]:col-start-2">{rate.carrier}</span>
                    <span className="font-semibold text-fg-muted max-[560px]:col-start-2 max-[560px]:row-start-2">
                      {rate.service}
                      {rate.estDays ? <small className="font-medium"> · {rate.estDays} day{rate.estDays > 1 ? 's' : ''}</small> : null}
                    </span>
                    <span className="font-extrabold max-[560px]:col-start-3 max-[560px]:row-span-2 max-[560px]:row-start-1">{formatMoney(rate.amount)}</span>
                  </label>
                </li>
              );
            })}
            {issues.map((issue) => (
              <li key={issue.carrier} className="text-[13px] text-fg-muted">{issue.carrier}: unavailable — {issue.error}</li>
            ))}
          </ul>
        </Card>
      </div>

      <aside className="sticky top-[calc(var(--header-h)+16px)] max-[980px]:static [&_p]:m-0 [&_p]:mb-3">
        <SummaryCard
          rows={[
            { label: 'Subtotal', value: formatMoney(subtotal) },
            { label: 'Shipping', value: formatMoney(selectedRate?.amount ?? 0) },
            { label: 'Grand Total', value: formatMoney(subtotal + (selectedRate?.amount ?? 0)), total: true },
          ]}
        >
          {error && <FormStatus kind="error" role="alert">{error}</FormStatus>}
          <Button variant="accent" wide onClick={proceedToPayment} disabled={paying || loadingRates}>
            {paying ? 'Loading…' : 'Proceed to Payment'}
          </Button>
          <p className="mt-0 text-[13px] text-fg-muted">Taxes are calculated and payment is collected securely by Stripe.</p>
        </SummaryCard>
      </aside>
    </div>
  );
}

export function CheckoutView() {
  const { ready } = useCart();
  // Mount the form only on the client, so saved-address state can initialise from localStorage.
  if (!ready) return <p className="muted" aria-live="polite">Loading checkout…</p>;
  return <CheckoutForm />;
}
