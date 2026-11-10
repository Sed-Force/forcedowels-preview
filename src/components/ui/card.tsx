import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

export const cardStyles = 'rounded-card border border-line bg-card p-6 shadow-card';

type CardProps = ComponentProps<'div'> & { as?: 'div' | 'article' | 'section' | 'aside' };

export function Card({ as: Tag = 'div', className, ...props }: CardProps) {
  return <Tag className={cn(cardStyles, className)} {...props} />;
}
