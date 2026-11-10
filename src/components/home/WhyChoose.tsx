import { Card } from '@/components/ui/card';
import { Container, Section } from '@/components/ui/layout';

const REASONS = [
  { title: 'Invisible Fasteners', body: 'Completely hidden fastening system' },
  { title: 'Assembly Speed', body: 'Reduce labor time and rework with a simple, process that takes only minutes.' },
  { title: 'Professional Finish', body: 'No visible screws or fasteners—premium look out of the box.' },
  { title: 'Labor Costs', body: 'Significantly reduce the costs on rework, and assembly.' },
  { title: 'No Glue Required', body: 'No glue necessary for strong joints; No unnecessary dry time saving you countless hours.' },
  { title: 'Order With Ease', body: 'Order online with simple replenishment and distribution options.' },
  { title: 'Long-Lasting Strength', body: 'Built to withstand everyday use without loosening or failure.' },
  { title: 'Universal Fit', body: 'Works seamlessly with most 8mm dowel systems for easy integration.' },
];

export function WhyChoose() {
  return (
    <Section alt id="why">
      <Container>
        <h2>Why Choose Force Dowels</h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-[18px]">
          {REASONS.map(({ title, body }) => (
            <Card key={title} as="article">
              <h3>{title}</h3>
              <p className="m-0">{body}</p>
            </Card>
          ))}
        </div>
      </Container>
    </Section>
  );
}
