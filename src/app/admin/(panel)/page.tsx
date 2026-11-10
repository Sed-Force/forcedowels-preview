import type { Metadata } from 'next';
import { OrdersPanel } from '@/components/admin/OrdersPanel';
import { AdminPage } from '@/components/admin/ui';

export const metadata: Metadata = { title: 'Orders' };

export default function AdminOrdersPage() {
  return (
    <AdminPage title="Orders" intro="Review, ship and manage customer orders.">
      <OrdersPanel />
    </AdminPage>
  );
}
