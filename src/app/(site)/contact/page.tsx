import type { Metadata } from 'next';
import { ContactForm } from '@/components/forms/ContactForm';
import { BusinessHours } from '@/components/ui/BusinessHours';
import { Card } from '@/components/ui/card';
import { Container, PageHeader, Section } from '@/components/ui/layout';
import { CONTACT, CONTACT_ADDRESS } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Contact the Force Dowels team about orders, pricing, and product support.',
};

export default function ContactPage() {
  return (
    <>
      <PageHeader title="Contact Us">
        Have questions about Force Dowels? Our team is here to help with orders, pricing, and product support.
      </PageHeader>

      <Section flush>
        <Container className="grid grid-cols-[0.9fr_1.1fr] gap-7 max-[900px]:grid-cols-1">
          {/* Info stays in view beside the (taller) form on wide screens. */}
          <aside className="min-[901px]:sticky min-[901px]:top-[calc(var(--header-h)+25px)] min-[901px]:self-start">
            <h2 className="sr-only">Company contact information</h2>
            <ul className="m-0 mb-5 grid list-none gap-3 p-0 text-lg leading-[1.6]">
              <BusinessHours />
              <li><strong>Phone:</strong> <a href={CONTACT.phoneHref}>{CONTACT.phone}</a></li>
              <li><strong>Email:</strong> <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a></li>
              <li><strong>Address:</strong> {CONTACT_ADDRESS}</li>
            </ul>

            <Card>
              <h3>Typical inquiries</h3>
              <ul className="m-0 list-disc pl-5">
                <li>Bulk pricing &amp; distributor requests</li>
                <li>Product specs &amp; compatibility</li>
                <li>Order updates &amp; shipping</li>
              </ul>
            </Card>
          </aside>

          <ContactForm />
        </Container>
      </Section>
    </>
  );
}
