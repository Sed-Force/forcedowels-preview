import { AdminHeader } from '@/components/admin/AdminHeader';

export default function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AdminHeader />
      <main id="content">{children}</main>
    </>
  );
}
