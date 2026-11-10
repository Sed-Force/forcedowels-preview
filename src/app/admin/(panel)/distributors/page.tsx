import type { Metadata } from 'next';
import { DistributorsPanel } from '@/components/admin/DistributorsPanel';
import { AdminPage } from '@/components/admin/ui';

export const metadata: Metadata = { title: 'Distributors' };

export default function AdminDistributorsPage() {
  return (
    <AdminPage title="Distributors" intro="Review applications and manage the public distributor finder.">
      <DistributorsPanel />
    </AdminPage>
  );
}
