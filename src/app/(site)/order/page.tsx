import type { Metadata } from 'next';
import { OrderConfigurator } from '@/components/order/OrderConfigurator';
import { PageHeader, Section } from '@/components/ui/layout';

export const metadata: Metadata = {
  title: 'Order',
  description: 'Choose a Force Dowels size, pick a bulk tier or starter kit, and check out in minutes.',
};

export default function OrderPage() {
  return (
    <>
      <PageHeader title="Order Force Dowels™">
        Choose a size, pick a bulk tier or starter kit, and check out in minutes.
      </PageHeader>
      <Section flush>
        <OrderConfigurator />
      </Section>
    </>
  );
}
