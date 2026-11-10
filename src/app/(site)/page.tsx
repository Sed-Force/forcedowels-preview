import { ContactSection } from '@/components/home/ContactSection';
import { Hero } from '@/components/home/Hero';
import { WhyChoose } from '@/components/home/WhyChoose';

export default function HomePage() {
  return (
    <>
      <Hero />
      <WhyChoose />
      <ContactSection />
    </>
  );
}
