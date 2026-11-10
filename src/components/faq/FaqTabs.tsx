'use client';

import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import { cn } from '@/lib/cn';
import type { FaqItem } from './faqData';

/**
 * Vertical tabs for wide screens: questions on the left, the selected answer on
 * the right in a frame that stays in view (sticky, below the navbar) while the
 * visitor scrolls the question list. Follows the WAI-ARIA tabs pattern
 * (arrow keys move and select; Home/End jump to the first/last question).
 */
export function FaqTabs({ items }: { items: FaqItem[] }) {
  const baseId = useId();
  const [selected, setSelected] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = items[selected];

  const tabId = (i: number) => `${baseId}-tab-${i}`;
  const panelId = `${baseId}-panel`;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = items.length - 1;
    const next =
      e.key === 'ArrowDown' ? (selected === last ? 0 : selected + 1)
      : e.key === 'ArrowUp' ? (selected === 0 ? last : selected - 1)
      : e.key === 'Home' ? 0
      : e.key === 'End' ? last
      : null;
    if (next === null) return;
    e.preventDefault();
    setSelected(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-8">
      <div role="tablist" aria-orientation="vertical" aria-label="Frequently asked questions" onKeyDown={onKeyDown} className="grid content-start gap-2.5">
        {items.map((item, i) => {
          const active = i === selected;
          return (
            <button
              key={item.question}
              ref={(el) => { tabRefs.current[i] = el; }}
              id={tabId(i)}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={panelId}
              tabIndex={active ? 0 : -1}
              onClick={() => setSelected(i)}
              className={cn(
                'flex w-full items-center justify-between gap-4 rounded-field  px-5 py-4 text-left text-[17px] font-extrabold shadow-card transition-colors',
                active ? 'bg-brand text-white' : 'bg-card text-fg hover:bg-card-alt',
              )}
            >
              <span>{item.question}</span>
              <ChevronRightIcon aria-hidden="true" strokeWidth={2.5} className={cn('size-[18px] flex-none transition-opacity', active ? 'text-white' : 'opacity-0')} />
            </button>
          );
        })}
      </div>

      {/* The grid cell stretches to the list's height; the frame inside it sticks under the navbar. */}
      <div>
        <div
          id={panelId}
          role="tabpanel"
          aria-labelledby={tabId(selected)}
          tabIndex={0}
          className="sticky top-[calc(var(--header-h)+25px)] min-h-60 overflow-hidden rounded-field bg-card shadow-card"
        >
          <h2 className="m-0 bg-brand px-6 py-5 text-xl text-white">{current.question}</h2>
          <div className="px-6 py-5 leading-[1.65] [&_ul]:m-0 [&_ul]:list-disc [&_ul]:pl-5">{current.answer}</div>
        </div>
      </div>
    </div>
  );
}
