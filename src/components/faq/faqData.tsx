import Link from 'next/link';
import type { ReactNode } from 'react';

export interface FaqItem {
  question: string;
  answer: ReactNode;
}

export const FAQS: FaqItem[] = [
  {
    question: 'Do Force Dowels come in different sizes?',
    answer: (
      <>
        Currently, we offer three sizes for purchase: 8mm × 38mm, 8mm × 30mm, and 6mm × 30mm. Choose a size on the{' '}
        <Link href="/order">Order</Link> page to see that size’s bulk pricing tiers and starter kit.
      </>
    ),
  },
  {
    question: 'What are Force Dowels made of?',
    answer:
      'Force Dowels are a patent-pending product made from a proprietary composite molded material. This unique design offers enhanced strength and reliability.',
  },
  {
    question: 'Are Force Dowels reusable?',
    answer:
      'Force Dowels are designed for single-use applications. However, if a mistake is made during assembly, you may be able to carefully remove the dowel from a leveraged position and reinsert a new dowel with glue.',
  },
  {
    question: 'How strong are Force Dowels?',
    answer: (
      <ul>
        <li>Our 8 x 38 mm dowels can hold up to 300 lbs.</li>
        <li>Our 8 x 30 mm can hold up to 200 lbs.</li>
        <li>Our 6 x 30 mm can hold up to 100 lbs.</li>
      </ul>
    ),
  },
  {
    question: 'What materials are Force Dowels compatible with?',
    answer: 'Force Dowels have been tested and perform exceptionally well in MDF, particle board, and plywood.',
  },
  {
    question: 'What size drill bit do I need?',
    answer:
      '8mm × 38mm and 8mm × 30mm Force Dowels are compatible with a standard 8mm drill bit (approximately 0.315"). The 6mm × 30mm size uses a standard 6mm drill bit.',
  },
  {
    question: 'Do I need any special tools to assemble with Force Dowels?',
    answer: 'No special tools are required. All you need is a rubber mallet for quick and easy assembly.',
  },
  {
    question: 'What is the minimum order quantity?',
    answer:
      'Our standard order quantity is 5,000 dowels, but we also offer a Starter Ship Kit with 300 dowels for $36.00 plus shipping—perfect for small shops or first-time users.',
  },
  {
    question: 'How long does shipping take?',
    answer:
      'We offer multiple shipping options via UPS and LTL freight carriers. Delivery times vary based on your chosen carrier and shipping method. Tracking is available on most orders.',
  },
  {
    question: 'Do you ship internationally?',
    answer:
      'Yes, we do! International orders can be placed over the phone while we work on integrating international shipping into our website. Please call us at 480-581-7145 for assistance.',
  },
  {
    question: 'Can I track my order?',
    answer:
      'Yes. Orders under 20,000 dowels are shipped via UPS and include a tracking number. For larger orders shipped via LTL carriers, tracking may vary, and an estimated delivery timeframe will be provided at checkout.',
  },
  {
    question: 'Do you offer bulk or distributor pricing?',
    answer: (
      <>
        Yes. Volume pricing is available, and distributor discounts begin on orders larger than 960,000 units. If
        you&apos;re looking to place a high-volume order, please reach out at{' '}
        <a href="mailto:info@forcedowels.com">info@forcedowels.com</a> or 480-581-7145 to discuss custom pricing.
      </>
    ),
  },
  {
    question: 'Can I order a sample or small test kit?',
    answer:
      'Absolutely. Our Starter Ship Kit includes 300 dowels for $36.00—a great way to try out our product before committing to larger volumes.',
  },
  {
    question: 'What if I make a mistake during assembly? Can I fix it?',
    answer:
      "If you're in a leveraged position, you can attempt to remove the dowel by gently rocking the panel side to side. Once removed, apply glue to the predrilled hole and reinsert the proper piece with a new dowel.",
  },
  {
    question: 'Are Force Dowels moisture-resistant?',
    answer: 'Yes. As a composite material, our dowels offer superior moisture resistance compared to traditional wooden dowels.',
  },
  {
    question: 'Can Force Dowels be used for outdoor furniture?',
    answer:
      'Yes! While originally designed for cabinetry, Force Dowels are excellent for use in indoor and outdoor furniture, drawer boxes, cabinet construction, and more.',
  },
  {
    question: 'Can I become a distributor?',
    answer: (
      <>
        Yes. If you&apos;re interested in becoming a distributor, you can{' '}
        <Link href="/distributor-application">apply through our website</Link>. Distributor pricing becomes available
        once your order volume reaches 960,000 units.
      </>
    ),
  },
];
