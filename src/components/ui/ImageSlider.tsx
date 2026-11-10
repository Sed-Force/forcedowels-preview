'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState, type TouchEvent } from 'react';
import { cn } from '@/lib/cn';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

export interface Slide {
  src: string;
  alt: string;
}

const arrow =
  'absolute top-1/2 z-[5] grid size-11 -translate-y-1/2 place-items-center rounded-full border border-accent bg-accent p-0 text-[26px] leading-none font-bold text-black shadow-card transition duration-[120ms] hover:scale-[1.04] hover:bg-accent-light hover:shadow-[0_12px_24px_rgb(0_0_0/0.12)] max-[560px]:size-10 max-[560px]:text-2xl';

const AUTOPLAY_MS = 4500;
const SWIPE_THRESHOLD_PX = 40;

/** Accessible carousel with arrows, dots, autoplay (paused on hover/focus), and swipe. */
export function ImageSlider({ slides, label }: { slides: Slide[]; label: string }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const count = slides.length;

  const goTo = useCallback((i: number) => setIndex(((i % count) + count) % count), [count]);

  // Re-arm the timer whenever the slide changes so manual navigation resets it.
  useEffect(() => {
    if (paused || count < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setTimeout(() => setIndex((i) => (i + 1) % count), AUTOPLAY_MS);
    return () => window.clearTimeout(timer);
  }, [index, paused, count]);

  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 1) touchStartX.current = e.touches[0].clientX;
    setPaused(true);
  };
  const onTouchEnd = (e: TouchEvent) => {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start !== null) {
      const dx = e.changedTouches[0].clientX - start;
      if (dx > SWIPE_THRESHOLD_PX) goTo(index - 1);
      else if (dx < -SWIPE_THRESHOLD_PX) goTo(index + 1);
    }
    setPaused(false);
  };

  return (
    <div
      className="relative overflow-hidden rounded-[calc(var(--radius-card)+4px)] border border-[#e9eef5] bg-white shadow-pop"
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div
        className="grid h-[clamp(320px,50vw,600px)] w-full grid-flow-col auto-cols-[100%] transition-transform duration-[400ms] ease-in-out max-[900px]:h-[clamp(240px,60vw,460px)]"
        style={{ transform: `translateX(-${index * 100}%)` }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        aria-live={paused ? 'polite' : 'off'}
      >
        {slides.map((slide, i) => (
          <div
            key={slide.src}
            className="relative h-full w-full overflow-hidden"
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${count}`}
            aria-hidden={i !== index}
          >
            <Image
              src={slide.src}
              alt={slide.alt}
              fill
              sizes="(max-width: 900px) 100vw, 55vw"
              className="object-cover"
              priority={i === 0}
            />
          </div>
        ))}
      </div>

      <button type="button" className={cn(arrow, 'left-3')} aria-label="Previous slide" onClick={() => goTo(index - 1)}>
        <ChevronLeftIcon aria-hidden="true" strokeWidth={2.5} className="size-6" />
      </button>
      <button type="button" className={cn(arrow, 'right-3')} aria-label="Next slide" onClick={() => goTo(index + 1)}>
        <ChevronRightIcon aria-hidden="true" strokeWidth={2.5} className="size-6" />
      </button>

      <div className="absolute bottom-3.5 left-1/2 flex -translate-x-1/2 gap-2 rounded-full border border-page-alt bg-page-alt px-2.5 py-1.5 shadow-card max-[560px]:bottom-2.5" role="tablist" aria-label="Choose slide">
        {slides.map((slide, i) => (
          <button
            key={slide.src}
            type="button"
            role="tab"
            aria-selected={i === index}
            className={cn('size-2.5 rounded-full border p-0 hover:bg-accent-light', i === index ? 'border-brand bg-accent' : 'border-page-alt bg-fg')}
            onClick={() => goTo(i)}
          >
            <span className="sr-only">Slide {i + 1}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
