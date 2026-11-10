import type { Metadata } from 'next';
import { ProductsPanel } from '@/components/admin/ProductsPanel';
import { AdminPage } from '@/components/admin/ui';

export const metadata: Metadata = { title: 'Products' };

export default function AdminProductsPage() {
  return (
    <AdminPage title="Products" intro="Turn sizes in and out of stock on the storefront.">
      <ProductsPanel />
    </AdminPage>
  );
}
