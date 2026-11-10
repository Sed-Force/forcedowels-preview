import { CONTACT } from '@/lib/site';
import { cn } from '@/lib/cn';

/** "Hours:" list item with one bullet per day range. Render inside a <ul>. */
export function BusinessHours({ bold = true, className }: { bold?: boolean; className?: string }) {
  return (
    <li className={className}>
      {bold ? <strong>Hours:</strong> : 'Hours:'}
      <ul className={cn('m-0 list-disc pl-6')}>
        {CONTACT.hours.map(({ days, time }) => (
          <li key={days}>{days}, {time}</li>
        ))}
      </ul>
    </li>
  );
}
