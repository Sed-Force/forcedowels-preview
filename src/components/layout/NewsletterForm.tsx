'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';

type Status = { kind: 'idle' } | { kind: 'sending' } | { kind: 'done' } | { kind: 'error'; message: string };

/** Newsletter signup. Requests are delivered to the team inbox through /api/contact. */
export function NewsletterForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus({ kind: 'sending' });
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Newsletter subscriber',
          email,
          inquiryType: 'newsletter',
          message: `Please add ${email} to the Force Dowels update list.`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || 'Request failed');
      setEmail('');
      setStatus({ kind: 'done' });
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Something went wrong' });
    }
  };

  return (
    <form className="flex flex-wrap items-center gap-x-5 gap-y-3 max-[768px]:flex-col max-[768px]:items-stretch" onSubmit={onSubmit}>
      <label className="sr-only" htmlFor="subscription-email">Enter your email</label>
      <input
        id="subscription-email"
        type="email"
        required
        placeholder="Enter your email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="min-w-0 flex-1 rounded-[10px]  bg-footer px-3.5 py-3 text-white placeholder:text-white/75 max-[768px]:w-full max-[768px]:flex-none"
      />
      <Button type="submit" variant="accent" disabled={status.kind === 'sending'}>
        {status.kind === 'sending' ? 'Subscribing…' : 'Subscribe'}
      </Button>
      <p role="status" className="m-0! min-h-[1.2em] basis-full text-sm">
        {status.kind === 'done' && 'Thanks — you’re on the list.'}
        {status.kind === 'error' && `Could not subscribe: ${status.message}`}
      </p>
    </form>
  );
}
