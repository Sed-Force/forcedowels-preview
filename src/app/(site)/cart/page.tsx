import type { Metadata } from 'next';
import { CartView } from '@/components/cart/CartView';
import { Container, PageHeader, Section } from '@/components/ui/layout';

export const metadata: Metadata = { title: 'Your Cart' };

export default function CartPage() {
  return (
    <>
      <PageHeader title="Your Cart" back={{ href: '/order', label: '← Back to Order' }} />
      <Section flush>
        <Container>
          <CartView />
        </Container>
      </Section>
    </>
  );
}
