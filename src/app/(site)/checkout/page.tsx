import type { Metadata } from 'next';
import { CheckoutView } from '@/components/checkout/CheckoutView';
import { Container, PageHeader, Section } from '@/components/ui/layout';

export const metadata: Metadata = { title: 'Checkout' };

export default function CheckoutPage() {
  return (
    <>
      <PageHeader title="Checkout" back={{ href: '/cart', label: '← Back to Cart' }} />
      <Section flush>
        <Container>
          <CheckoutView />
        </Container>
      </Section>
    </>
  );
}
