import type { Metadata } from 'next';
import { Container, PageHeader, Section } from '@/components/ui/layout';
import { VideoGallery } from '@/components/videos/VideoGallery';

export const metadata: Metadata = {
  title: 'Videos',
  description: 'Watch Force Dowels load tests, comparisons, and cabinet assembly walkthroughs.',
};

const VIDEOS = [
  { id: 'mHjCnSkdZ1o', title: 'Force Dowel Comparison' },
  { id: 'bQ3HrRR9ERU', title: '540lb Structural Load Test' },
  { id: '2yGzh8P3YB8', title: 'Drill and Dowel Machine' },
  { id: 'OfQiub4Szm4', title: 'Sideways Endurance Test- Over 330 lbs - 9 days' },
  { id: 'VgTYhwdQtBk', title: 'Sink Base Cabinet Assembly Video' },
  { id: '2JwbYhqQLgo', title: 'Base Cabinet Assembly Video' },
  { id: 'Y7wXrM5CKj8', title: 'Upper Cabinet Assembly Video' },
  { id: 'FMUZqFzqhos', title: 'Drawer Base Cabinet Assembly Video' },
];

export default function VideosPage() {
  return (
    <>
      <PageHeader title="Force Dowels Video Gallery" eyebrow="Patent Pending Technology" />

      <Section flush>
        <Container>
          <VideoGallery videos={VIDEOS} />
        </Container>
      </Section>
    </>
  );
}
