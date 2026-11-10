'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FormStatus, Input, Select } from '@/components/ui/form';
import { MapPinIcon } from '@heroicons/react/24/outline';
import { MapPinIcon as MapPinSolid } from '@heroicons/react/24/solid';

interface Distributor {
  id: number;
  company: string;
  phone: string | null;
  website: string | null;
  territory: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  distanceMiles?: number;
}

type View =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'results'; distributors: Distributor[] };

const RADII = [25, 50, 100, 200];

export function DistributorFinder() {
  const [zip, setZip] = useState('');
  const [radius, setRadius] = useState(50);
  const [view, setView] = useState<View>({ kind: 'idle' });

  const load = async (query: URLSearchParams) => {
    setView({ kind: 'loading' });
    try {
      const res = await fetch(`/api/distributors?${query}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load distributors.');
      setView({ kind: 'results', distributors: data.distributors ?? [] });
    } catch (err) {
      setView({ kind: 'error', message: err instanceof Error ? err.message : 'Could not load distributors.' });
    }
  };

  const searchZip = (e: FormEvent) => {
    e.preventDefault();
    void load(new URLSearchParams({ zip: zip.trim(), radius: String(radius) }));
  };

  const useLocation = () => {
    if (!navigator.geolocation) {
      setView({ kind: 'error', message: 'Location is not available in this browser. Try searching by ZIP code.' });
      return;
    }
    setView({ kind: 'loading' });
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => void load(new URLSearchParams({ lat: String(coords.latitude), lng: String(coords.longitude), radius: String(radius) })),
      () => setView({ kind: 'error', message: 'We could not get your location. Try searching by ZIP code.' }),
      { timeout: 10000 },
    );
  };

  return (
    <div className="rounded-card border border-line bg-card p-6 shadow-card">
      <header>
        <h2>Find Distributors Near You</h2>
        <p className="mt-0 mb-4 text-fg-muted">Search by ZIP code or use your current location to see partners in your area.</p>
      </header>

      <form className="mb-2 grid grid-cols-[1fr_200px_auto] items-end gap-4 max-[768px]:grid-cols-1" onSubmit={searchZip}>
        <Field label="ZIP code">
          <Input inputMode="numeric" autoComplete="postal-code" placeholder="e.g., 85296" pattern="\d{5}(-\d{4})?" required value={zip} onChange={(e) => setZip(e.target.value)} />
        </Field>
        <Field label="Search radius">
          <Select value={radius} onChange={(e) => setRadius(Number(e.target.value))}>
            {RADII.map((r) => <option key={r} value={r}>{r} miles</option>)}
          </Select>
        </Field>
        <div className="flex gap-2.5 max-[768px]:*:flex-1">
          <Button type="submit" variant="accent">Search ZIP</Button>
          <Button variant="ghost" onClick={useLocation}>
            <MapPinIcon aria-hidden="true" className="size-4" />
            Use Location
          </Button>
        </div>
        <button type="button" className="col-span-full justify-self-start p-0 font-bold text-accent" onClick={() => void load(new URLSearchParams({ all: '1' }))}>
          Show all distributors
        </button>
      </form>

      <div className="mt-5 min-h-40 rounded-field border border-dashed border-line-strong bg-card-alt p-5 [&>p]:m-0" aria-live="polite">
        {view.kind === 'idle' && <p className="text-fg-muted">Enter a ZIP code or use your location to find a distributor.</p>}
        {view.kind === 'loading' && <p className="text-fg-muted">Searching…</p>}
        {view.kind === 'error' && <FormStatus kind="error" role="alert">{view.message}</FormStatus>}
        {view.kind === 'results' && view.distributors.length === 0 && (
          <div className="grid justify-items-center gap-1 text-center text-fg-muted [&_p]:m-0">
            <MapPinSolid aria-hidden="true" className="size-10 text-accent" />
            <p><strong>No distributors found</strong></p>
            <p>Try a different ZIP code, expand the search radius, or <Link href="/contact">contact us</Link> directly.</p>
          </div>
        )}
        {view.kind === 'results' && view.distributors.length > 0 && (
          <ul className="m-0 grid list-none grid-cols-2 gap-3.5 p-0 max-[768px]:grid-cols-1">
            {view.distributors.map((d) => (
              <li key={d.id} className="rounded-field border border-line bg-card p-4 [&_p]:m-0 [&_p]:mb-1">
                <h3 className="mb-1.5">{d.company}</h3>
                {(d.city || d.state) && <p>{[d.city, d.state].filter(Boolean).join(', ')} {d.zip}</p>}
                {d.territory && <p className="text-fg-muted">Territory: {d.territory}</p>}
                {d.distanceMiles !== undefined && <p className="font-extrabold text-accent">{d.distanceMiles} miles away</p>}
                <p className="mt-2! flex flex-wrap gap-3.5">
                  {d.phone && <a href={`tel:${d.phone}`}>{d.phone}</a>}
                  {d.website && <a href={d.website} target="_blank" rel="noopener noreferrer">Website</a>}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
