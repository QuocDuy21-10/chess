'use client';

import type { ReactNode } from 'react';

/** A native modal <dialog>: the browser traps focus and reports Escape through onCancel. */
export function Modal(props: { label: string; onCancel: () => void; children: ReactNode }) {
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
      className="m-auto rounded-xl bg-stone-900 p-6 text-stone-100 shadow-2xl backdrop:bg-black/50"
    >
      {props.children}
    </dialog>
  );
}
