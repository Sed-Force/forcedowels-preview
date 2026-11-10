'use client';

import { useId, useState } from 'react';
import { cn } from '@/lib/cn';
import type { FaqItem } from './faqData';
import { PlusIcon } from '@heroicons/react/24/outline';

/** Single-open accordion: opening one item collapses the others. */
export function Accordion({ items }: { items: FaqItem[] }) {
  const baseId = useId();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="grid gap-3">
      {items.map((item, i) => {
        const open = openIndex === i;
        const panelId = `${baseId}-panel-${i}`;
        const triggerId = `${baseId}-trigger-${i}`;
        return (
          <div
            key={item.question}
            className={cn('overflow-hidden rounded-field border bg-card shadow-card', open ? 'border-accent' : 'border-line')}
          >
            <h3 className="m-0 text-[length:inherit]">
              <button
                id={triggerId}
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpenIndex(open ? null : i)}
                className="flex w-full items-center justify-between gap-4 border-0 bg-brand px-5 py-4 text-left text-[17px] font-extrabold text-white hover:bg-brand-ink"
              >
                <span>{item.question}</span>
                <PlusIcon aria-hidden="true" strokeWidth={2.5} className={cn('size-[18px] flex-none transition-transform duration-200', open && 'rotate-45')} />
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={triggerId}
              hidden={!open}
              className="px-5 pt-4 pb-[18px] leading-[1.65] [&_ul]:m-0 [&_ul]:list-disc [&_ul]:pl-5"
            >
              {item.answer}
            </div>
          </div>
        );
      })}
    </div>
  );
}
