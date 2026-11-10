import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginPanel } from '@/components/layout/LoginPanel';
import { Container, PageHeader, Section } from '@/components/ui/layout';

export const metadata: Metadata = {
  title: 'Log In',
  description: 'Log in to your Force Dowels account to place orders and track shipments.',
  robots: { index: false },
};

export default function LoginPage() {
  return (
    <>
      <PageHeader title="Log In">Sign in to place orders and track your shipments.</PageHeader>
      <Section flush>
        <Container>
          <Suspense fallback={<p className="text-fg-muted">Loading sign-in…</p>}>
            <LoginPanel />
          </Suspense>
        </Container>
      </Section>
    </>
  );
}
