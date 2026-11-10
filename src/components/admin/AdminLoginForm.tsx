'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Field, FormCard, FormStatus, Input } from '@/components/ui/form';
import { Container, PageHeader, Section } from '@/components/ui/layout';
import { AdminLogo } from './AdminLogo';

export function AdminLoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: form.get('username'), password: form.get('password') }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.message || 'Invalid credentials');
      router.replace('/admin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
      setBusy(false);
    }
  };

  return (
    <>
      <header className="border-b border-white/12 bg-brand">
        <Container wide className="flex min-h-(--header-h) items-center justify-between gap-3">
          <AdminLogo />
          <ThemeToggle />
        </Container>
      </header>
      <main id="content">
        <PageHeader title="Admin Sign In" wide>Please sign in to continue.</PageHeader>
        <Section flush>
          <Container wide>
            <FormCard onSubmit={onSubmit} className="w-[min(440px,100%)]">
              {error && <FormStatus kind="error" role="alert">{error}</FormStatus>}
              <Field label="Username"><Input name="username" required autoComplete="username" /></Field>
              <Field label="Password"><Input name="password" type="password" required autoComplete="current-password" /></Field>
              <Button type="submit" variant="accent" wide disabled={busy}>{busy ? 'Signing in…' : 'Sign In'}</Button>
            </FormCard>
          </Container>
        </Section>
      </main>
    </>
  );
}
