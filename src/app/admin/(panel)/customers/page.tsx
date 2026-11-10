import type { Metadata } from 'next';
import { CustomersPanel } from '@/components/admin/CustomersPanel';
import { AdminPage } from '@/components/admin/ui';

export const metadata: Metadata = { title: 'Customers' };

export default function AdminCustomersPage() {
  return (
    <AdminPage title="Customers" intro="Everyone who has ordered, with their order history.">
      <CustomersPanel />
    </AdminPage>
  );
}
