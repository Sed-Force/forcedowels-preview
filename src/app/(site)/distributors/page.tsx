import type { Metadata } from 'next';
import { DistributorFinder } from '@/components/distributors/DistributorFinder';
import { Container, PageHeader, Section } from '@/components/ui/layout';

export const metadata: Metadata = {
  title: 'Find a Distributor',
  description: 'Find a local Force Dowels distributor by ZIP code or current location.',
};

export default function DistributorsPage() {
  return (
    <>
      <PageHeader title="Find a Local Distributor">
        Work with one of our local partners for quick access and tailored purchasing options.
      </PageHeader>
      <Section flush>
        <Container>
          <DistributorFinder />
        </Container>
      </Section>
    </>
  );
}
