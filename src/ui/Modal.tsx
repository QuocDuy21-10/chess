'use client';

import type { ReactNode } from 'react';

/**
 * A native modal <dialog>: the browser traps focus and reports Escape through onCancel.
 * `sheet` anchors it to the bottom edge as a drawer, and lets a tap on the backdrop close it.
 */
export function Modal(props: { label: string; onCancel: () => void; sheet?: boolean; children: ReactNode }) {
  return (
    <dialog
      ref={(dialog) => {
        if (dialog && !dialog.open) dialog.showModal();
      }}
      aria-label={props.label}
      onCancel={(event) => {
        event.preventDefault();
        props.onCancel();
      }}
      // A click on the backdrop lands on the dialog itself. The padding is on the inner box,
      // so a click anywhere inside lands on a child instead.
      onClick={(event) => {
        if (props.sheet && event.target === event.currentTarget) props.onCancel();
      }}
      className={`bg-stone-900 text-stone-100 shadow-2xl backdrop:bg-black/50 ${
        props.sheet ? 'mx-0 mt-auto mb-0 w-full max-w-none rounded-t-xl' : 'm-auto rounded-xl'
      }`}
    >
      <div className={props.sheet ? 'p-4 pb-[max(1rem,env(safe-area-inset-bottom))]' : 'p-6'}>{props.children}</div>
    </dialog>
  );
}
