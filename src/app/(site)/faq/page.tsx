import type { Metadata } from 'next';
import { Accordion } from '@/components/faq/Accordion';
import { FaqTabs } from '@/components/faq/FaqTabs';
import { FAQS } from '@/components/faq/faqData';
import { Container, PageHeader, Section } from '@/components/ui/layout';

export const metadata: Metadata = {
  title: 'FAQ',
  description: 'Answers about Force Dowels sizes, strength, materials, shipping, ordering, and distributors.',
};

export default function FaqPage() {
  return (
    <>
      <PageHeader title="Frequently Asked Questions" eyebrow="Patent Pending Technology" />
      <Section flush>
        <Container>
          {/* One question list, two presentations: accordion on narrow screens, vertical tabs from 1024px up. */}
          <div className="lg:hidden"><Accordion items={FAQS} /></div>
          <div className="hidden lg:block"><FaqTabs items={FAQS} /></div>
        </Container>
      </Section>
    </>
  );
}
