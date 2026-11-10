import type { Metadata } from 'next';
import { Suspense } from 'react';
import { OrderConfirmation } from '@/components/checkout/OrderConfirmation';
import { Container, PageHeader, Section } from '@/components/ui/layout';

export const metadata: Metadata = { title: 'Order Confirmed', robots: { index: false } };

export default function OrderSuccessPage() {
  return (
    <>
      <PageHeader title="Order Confirmed" />
      <Section flush>
        <Container>
          <Suspense fallback={<p className="text-fg-muted">Loading your order…</p>}>
            <OrderConfirmation />
          </Suspense>
        </Container>
      </Section>
    </>
  );
}
