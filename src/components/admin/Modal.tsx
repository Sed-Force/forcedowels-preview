'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

/** Native <dialog> wrapper: focus trap, Escape and backdrop click come for free. */
export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}
      className="m-auto max-h-[92vh] w-[min(560px,calc(100vw-24px))] overflow-auto rounded-card border border-line bg-card p-0 text-fg shadow-pop backdrop:bg-black/60"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-brand px-6 py-4 text-white max-[480px]:px-4">
        <h2 className="m-0 text-2xl">{title}</h2>
        <button type="button" aria-label="Close" onClick={() => ref.current?.close()} className="grid size-10 place-items-center border-0 bg-transparent text-white hover:text-accent">
          <XMarkIcon aria-hidden="true" className="size-7" />
        </button>
      </div>
      <div className="p-6 max-[480px]:p-4">{open && children}</div>
    </dialog>
  );
}
