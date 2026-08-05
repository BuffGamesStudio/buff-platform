"use client";

import type { ReactNode } from "react";

export function MovieBuffGameMenu({
  open,
  onClose,
  children,
  penaltyLabel,
}: {
  open: boolean;
  onClose: () => void;
  children?: ReactNode;
  penaltyLabel?: string | null;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-5">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="movie-buff-game-menu-title"
        className="w-full max-w-md rounded-3xl border border-red-500/30 bg-zinc-950 p-6 text-white shadow-2xl"
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id="movie-buff-game-menu-title" className="text-2xl font-black">
            Game Menu
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-700 px-3 py-2 font-bold"
          >
            Close
          </button>
        </div>
        {penaltyLabel ? (
          <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
            {penaltyLabel}
          </p>
        ) : null}
        {children ? <div className="mt-5 space-y-3">{children}</div> : null}
      </section>
    </div>
  );
}
