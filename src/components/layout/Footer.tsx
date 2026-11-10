import Image from 'next/image';
import Link from 'next/link';
import { BusinessHours } from '@/components/ui/BusinessHours';
import { Container } from '@/components/ui/layout';
import { CONTACT } from '@/lib/site';
import { CopyrightYear } from './CopyrightYear';
import { NewsletterForm } from './NewsletterForm';

const QUICK_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/order', label: 'Order Now' },
  { href: '/videos', label: 'Product Videos' },
  { href: '/distributors', label: 'Find a Distributor' },
  { href: '/distributor-application', label: 'Become a Distributor' },
];

const heading = 'm-0 text-2xl font-bold text-white';
const section = 'flex flex-col gap-2.5';
const plainList = 'flex flex-col list-disc pl-4 flex-col gap-2';

export function Footer() {
  return (
    // The footer always sits on brand blue, so text is white and links are accent.
    <footer className="bg-footer pb-5 text-white [&_a:hover]:text-accent-light [&_a]:text-accent">
      <Container>
        <div className="grid grid-cols-5 gap-5 py-5 max-[1280px]:grid-cols-4 max-[1120px]:grid-cols-2 max-[768px]:grid-cols-1">
          <div className="col-[1/3] flex flex-col gap-5 max-[1120px]:col-[1/2] max-[768px]:col-[1/-1]">
            <section className={section}>
              <Link href="/" aria-label="Force Dowels home" className="inline-block overflow-hidden rounded-lg">
                <Image
                  src="/images/LOGO_Wordmark+Icon-WhiteAccent@1024.png"
                  alt="Force Dowels logo"
                  width={1024}
                  height={258}
                  className="h-auto w-[min(100%,340px)]"
                />
              </Link>
              <p className="m-0">
                Revolutionary cabinetry fasteners that deliver faster assembly, stronger connections, and flawless
                finishes. Experience the next generation of cabinet construction.
              </p>
            </section>

            <section className={section}>
              <h4 className={heading}>Contact Us</h4>
              
              <ul className={plainList}>
                <BusinessHours bold={false} />
                <li><p className="m-0">Phone: <a href={CONTACT.phoneHref}>{CONTACT.phone}</a></p></li>
                <li><p className="m-0">Email: <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a></p></li>
                <li><p className="m-0">Address: {CONTACT.street}<br />{CONTACT.cityStateZip}</p></li>
              </ul>
            </section>
          </div>

          <div className="col-[3/-1] flex flex-col justify-end gap-5 max-[1120px]:col-[2/-1] max-[768px]:col-[1/-1] max-[768px]:flex-col-reverse">
            <section className={section}>
              <h4 className={heading}>Quick Links</h4>
              <ul className={plainList}>
                {QUICK_LINKS.map(({ href, label }) => (
                  <li key={href}><Link href={href}>{label}</Link></li>
                ))}
              </ul>
            </section>

            <section className="rounded-lg bg-footer-panel p-5 [&_p]:my-2">
              <h4 className={heading}>Stay Updated</h4>
              <p>Get the latest updates on our patent-pending technology and new product releases.</p>
              <NewsletterForm />
              <p className="text-[smaller]">We respect your privacy. Unsubscribe at any time.</p>
            </section>
          </div>
        </div>

        <hr className="m-0 rounded-xs border-0 border-t-[3px] border-footer-panel" />

        <div className="flex items-center justify-between gap-5 py-4 leading-[1.2] max-[768px]:flex-col max-[768px]:items-start max-[768px]:gap-2.5">
          <div className="[&_p]:m-0 [&_p]:mb-1.5">
            <p>© <CopyrightYear /> Force Dowels. All rights reserved.</p>
            <p>Patent Pending Technology - Revolutionary Cabinetry Fasteners</p>
          </div>
          <ul aria-label="Legal" className="m-0 flex list-none gap-6 p-0 max-[768px]:flex-wrap [&_a]:whitespace-nowrap">
            <li><Link href="/privacy">Privacy Policy</Link></li>
            <li><Link href="/terms">Terms of Service</Link></li>
          </ul>
        </div>
      </Container>
    </footer>
  );
}
