import { Footer } from '@/components/layout/Footer';
import { Navbar } from '@/components/layout/Navbar';
import { AppProviders } from '@/components/providers/AppProviders';

/** Public storefront shell: auth + cart providers, global navbar and footer. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProviders>
      <Navbar />
      <main id="content">{children}</main>
      <Footer />
    </AppProviders>
  );
}
