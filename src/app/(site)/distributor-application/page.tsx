import type { Metadata } from 'next';
import { DistributorApplicationForm } from '@/components/distributors/DistributorApplicationForm';
import { Container, PageHeader, Section } from '@/components/ui/layout';

export const metadata: Metadata = {
  title: 'Become a Distributor',
  description: 'Apply to become a Force Dowels distributor.',
};

export default function DistributorApplicationPage() {
  return (
    <>
      <PageHeader title="Distributor Application">
        Tell us about your business and territory. We’ll follow up with pricing, onboarding, and marketing assets.
      </PageHeader>
      <Section flush>
        <Container>
          <DistributorApplicationForm />
        </Container>
      </Section>
    </>
  );
}
