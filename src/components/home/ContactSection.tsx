import { ContactForm } from '@/components/forms/ContactForm';
import { BusinessHours } from '@/components/ui/BusinessHours';
import { Container, Section } from '@/components/ui/layout';
import { CONTACT, CONTACT_ADDRESS } from '@/lib/site';

export function ContactSection() {
  return (
    <Section id="contact">
      <Container className="grid grid-cols-[1.15fr_0.85fr] gap-7 max-[900px]:grid-cols-1 max-[900px]:gap-5">
        {/* Info stays in view beside the (taller) form on wide screens. */}
        <div className="min-[901px]:sticky min-[901px]:top-[calc(var(--header-h)+25px)] min-[901px]:self-start">
          <h2 className="mb-3.5 text-[30px]">Contact Us</h2>
          <p>
            {CONTACT.response}
          </p>

          <ul className="m-0 grid gap-3 p-0 text-lg leading-[1.7] max-[900px]:text-base">
            <BusinessHours />
            <li><strong>Phone:</strong> <a href={CONTACT.phoneHref}>{CONTACT.phone}</a></li>
            <li><strong>Email:</strong> <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a></li>
            <li><strong>Address:</strong> {CONTACT_ADDRESS}</li>
          </ul>
        </div>
        <ContactForm />
      </Container>
    </Section>
  );
}
