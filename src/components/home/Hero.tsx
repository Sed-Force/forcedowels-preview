import { ButtonLink } from '@/components/ui/button';
import { Container, Eyebrow, Section, Subline } from '@/components/ui/layout';
import { ImageSlider, type Slide } from '@/components/ui/ImageSlider';

const SLIDES: Slide[] = [
  { src: '/images/dowel-still-photo.jpg', alt: 'Force Dowels close-up photo' },
  { src: '/images/dowel-group-photo.jpg', alt: 'Force Dowels group photo' },
  { src: '/images/slider-3.jpg', alt: 'Force Dowels product photo 3' },
  { src: '/images/slider-4.jpg', alt: 'Force Dowels product photo 4' },
  { src: '/images/slider-5.jpg', alt: 'Force Dowels product photo 5' },
];

const NEW_SIZES = ['8mm × 38mm', '8mm × 30mm', '6mm × 30mm'];

const BADGES = [
  'No Exterior Fastener for a Cleaner Look',
  'No Glue Necessary',
  'Significantly Reduced Labor Cost',
  'Patent Pending',
  'Built for RTA Efficiency — Strong, Simple, Reliable',
  'Integrates Seamlessly With Most 8mm Dowel Systems',
];

export function Hero() {
  return (
    <Section className="bg-[radial-gradient(1200px_420px_at_20%_-10%,rgb(34_77_143/0.1),transparent),radial-gradient(900px_520px_at_90%_0%,rgb(238_173_26/0.12),transparent)]">
      <Container className="grid grid-cols-[0.9fr_1.1fr] items-start gap-9 max-[900px]:grid-cols-1 max-[900px]:gap-5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col">
            <h1>Force Dowels™</h1>
            <Eyebrow>Patent Pending</Eyebrow>
            <Subline>Experience the next generation of cabinet assembly: faster, stronger, and with a flawless finish.</Subline>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-x-3 gap-y-2 overflow-hidden rounded-field border border-brand border-b-4 bg-brand-tint text-[15px] leading-[1.4] text-notice max-[560px]:flex-col">
              <div className="flex flex-1 flex-col items-center p-3">
                <p className="m-0 font-extrabold">You asked, and we listened...</p>
                <p className="m-0">More sizes are available now!</p>
              </div>
              <ul className="m-0 flex flex-1 list-none flex-col items-start justify-center gap-x-3 gap-y-2 py-1 pr-3 pl-0 max-[560px]:items-center max-[560px]:px-3 max-[560px]:pt-0 max-[560px]:pb-3">
                {NEW_SIZES.map((size) => (
                  <li key={size}><strong>{size}</strong></li>
                ))}
              </ul>
            </div>

            <div className="flex flex-wrap gap-2.5 *:flex-1">
              <ButtonLink variant="accent" href="/order">Order Now</ButtonLink>
              <ButtonLink variant="ghost" href="/contact">Request a Quote</ButtonLink>
            </div>
          </div>

          <ul className="flex flex-col gap-2 list-disc pl-4 max-w-[560px] max-[900px]:max-w-full">
            {BADGES.map((badge) => (
              <li key={badge} className="font-bold text-fg">
                {badge}
              </li>
            ))}
          </ul>
        </div>

        <ImageSlider slides={SLIDES} label="Product photos" />
      </Container>
    </Section>
  );
}
