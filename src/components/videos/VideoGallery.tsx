'use client';

import { useState } from 'react';
import { PlayIcon } from '@heroicons/react/24/solid';
import { cn } from '@/lib/cn';

export type Video = { id: string; title: string };

/**
 * One large YouTube player plus a list of every video by title.
 * - Wide screens: the list sits to the right of the player, matches its height and scrolls.
 * - Phones: the player stays pinned under the navbar while the title list scrolls beneath it.
 * Playback uses YouTube's own controls (which include full screen).
 */
export function VideoGallery({ videos }: { videos: Video[] }) {
  const [activeId, setActiveId] = useState(videos[0].id);
  // Autoplay only after the visitor picks a video; the first one waits for a press of play.
  const [picked, setPicked] = useState(false);
  const active = videos.find((v) => v.id === activeId) ?? videos[0];

  const select = (id: string) => {
    setActiveId(id);
    setPicked(true);
  };

  const src = `https://www.youtube-nocookie.com/embed/${active.id}?rel=0&modestbranding=1&playsinline=1${picked ? '&autoplay=1' : ''}`;

  return (
    <div className="grid items-start gap-x-6 gap-y-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      {/* Player: sticky under the navbar on small screens. */}
      <div className="sticky top-[calc(var(--header-h)+1px)] z-10 -mx-5 border-b border-line bg-page px-5 pt-3 pb-3 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0">
        <div className="aspect-video overflow-hidden rounded-field bg-black shadow-card">
          <iframe
            key={active.id}
            src={src}
            title={active.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="size-full border-0"
          />
        </div>
        <h2 className="mt-3 mb-0 truncate text-lg lg:mt-4 lg:text-2xl" aria-live="polite">
          {active.title}
        </h2>
      </div>

      {/* Title list: flows with the page on phones, fills the player's height (and scrolls) beside it on wide screens. */}
      <nav aria-label="Videos" className="relative lg:self-stretch">
        <ul className="m-0 grid list-none gap-2 p-0 lg:absolute lg:inset-0 lg:content-start lg:overflow-y-auto lg:pr-1">
          {videos.map(({ id, title }, i) => {
            const current = id === active.id;
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => select(id)}
                  aria-current={current ? 'true' : undefined}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-field border bg-card px-3.5 py-3 text-left text-fg shadow-card transition-colors',
                    current ? 'border-accent' : 'border-line hover:border-line-strong hover:bg-card-alt',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'grid size-9 shrink-0 place-items-center rounded-full text-sm font-extrabold',
                      current ? 'bg-accent text-black' : 'bg-brand text-white',
                    )}
                  >
                    {current ? <PlayIcon className="size-4 translate-x-px" /> : i + 1}
                  </span>
                  <span className="min-w-0 flex-1 font-bold">{title}</span>
                  {current && <span className="sr-only">(now playing)</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
