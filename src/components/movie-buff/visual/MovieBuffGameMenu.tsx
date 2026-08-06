"use client";

import {
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

const focusableSelector = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

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
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    openerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const animationFrame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
      document.body.style.overflow = previousOverflow;
      openerRef.current?.focus();
      openerRef.current = null;
    };
  }, [open]);

  if (!open) return null;

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== "Tab") return;

    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [],
    ).filter((element) => !element.hasAttribute("disabled"));

    if (focusable.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || active === dialogRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-5"
      data-movie-buff-game-menu-overlay="true"
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="movie-buff-game-menu-title"
        aria-describedby="movie-buff-game-menu-description"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="w-full max-w-md rounded-3xl border border-red-500/30 bg-zinc-950 p-6 text-white shadow-2xl outline-none"
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id="movie-buff-game-menu-title" className="text-2xl font-black">
            Game Menu
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-700 px-3 py-2 font-bold outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
          >
            Close
          </button>
        </div>
        <p id="movie-buff-game-menu-description" className="sr-only">
          Presentation-only game menu. Shared gameplay phases continue from authoritative server state.
        </p>
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
