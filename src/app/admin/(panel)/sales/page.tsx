import type { Metadata } from 'next';
import { SalesPanel } from '@/components/admin/SalesPanel';
import { AdminPage } from '@/components/admin/ui';

export const metadata: Metadata = { title: 'Sales' };

export default function AdminSalesPage() {
  return (
    <AdminPage title="Sales" intro="Revenue and order volume over time.">
      <SalesPanel />
    </AdminPage>
  );
}
