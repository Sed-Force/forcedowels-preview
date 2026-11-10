import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Teach tailwind-merge about the project's custom theme keys so later
// utilities reliably override earlier ones (e.g. `rounded-card` vs `rounded-full`).
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      rounded: [{ rounded: ['card', 'field'] }],
      shadow: [{ shadow: ['card', 'pop'] }],
      'max-w': [{ 'max-w': ['site', 'wide', 'narrow'] }],
    },
  },
});

/** Merge Tailwind class names; conflicting utilities resolve in favour of the last one. */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));
