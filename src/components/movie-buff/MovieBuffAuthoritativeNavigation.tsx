"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  type FormEvent,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  advanceMovieBuffAuthoritativePhase,
  getMovieBuffAuthoritativePhase,
  type MovieBuffAuthoritativePhaseView,
} from "@/lib/game/movieBuffAuthoritativePhaseClient";

const LEGACY_MANUAL_LABELS = new Set([
  "start round",
  "continue to clip round",
  "current live flow",
  "next round",
  "waiting for host to click",
]);

const AUTHORITATIVE_PHASE_PATHS = new Set([
  "/games/movie-buff/round-intro",
  "/games/movie-buff/board",
  "/games/movie-buff/play",
  "/games/movie-buff/round-results",
]);

function normalizeLabel(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function routeWithRoom(
  phaseRoute: string,
  roomId: string,
  roundNumber: number,
) {
  const separator = phaseRoute.includes("?") ? "&" : "?";
  return `${phaseRoute}${separator}roomId=${encodeURIComponent(roomId)}&round=${encodeURIComponent(String(roundNumber))}`;
}

export function MovieBuffAuthoritativeNavigation({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const roomId = searchParams.get("roomId")?.trim() ?? "";
  const shouldSynchronize = Boolean(
    roomId && AUTHORITATIVE_PHASE_PATHS.has(pathname),
  );
  const [view, setView] = useState<MovieBuffAuthoritativePhaseView | null>(null);
  const [syncError, setSyncError] = useState("");
  const syncing = useRef(false);

  const synchronize = useCallback(async () => {
    if (!shouldSynchronize || syncing.current) return;
    syncing.current = true;

    try {
      setSyncError("");
      let nextView = await getMovieBuffAuthoritativePhase(roomId);

      // The browser may request evaluation, but the database alone decides
      // whether a deadline/completion predicate permits a transition.
      try {
        await advanceMovieBuffAuthoritativePhase(roomId, nextView.phaseVersion);
        nextView = await getMovieBuffAuthoritativePhase(roomId);
      } catch {
        // A stale-version or not-yet-due response is expected under concurrent
        // clients. Reloading on the next poll preserves server authority.
      }

      setView(nextView);

      if (nextView.phaseRoute && pathname !== nextView.phaseRoute) {
        router.replace(
          routeWithRoom(nextView.phaseRoute, roomId, nextView.roundNumber),
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message === "SIGN_IN_REQUIRED") {
        router.replace(
          `/sign-in?next=${encodeURIComponent(`${pathname}?roomId=${roomId}`)}`,
        );
        return;
      }

      setSyncError(
        error instanceof Error
          ? error.message
          : "Unable to synchronize the authoritative match phase.",
      );
    } finally {
      syncing.current = false;
    }
  }, [pathname, roomId, router, shouldSynchronize]);

  useEffect(() => {
    if (!shouldSynchronize) {
      setView(null);
      setSyncError("");
      return;
    }

    void synchronize();
    const interval = window.setInterval(() => void synchronize(), 750);
    return () => window.clearInterval(interval);
  }, [shouldSynchronize, synchronize]);

  function blockLegacyClick(event: MouseEvent<HTMLDivElement>) {
    const element = event.target instanceof Element
      ? event.target.closest("button,a")
      : null;
    if (!element) return;

    const label = normalizeLabel(element.textContent);
    if (!LEGACY_MANUAL_LABELS.has(label)) return;

    event.preventDefault();
    event.stopPropagation();
  }

  function blockLegacySubmit(event: FormEvent<HTMLDivElement>) {
    const nativeEvent = event.nativeEvent as SubmitEvent;
    const submitter = nativeEvent.submitter;
    const label = normalizeLabel(submitter?.textContent);
    if (!LEGACY_MANUAL_LABELS.has(label)) return;

    event.preventDefault();
    event.stopPropagation();
  }

  const terminal = view?.phase === "blocked" || view?.phase === "abandoned";

  return (
    <div onClickCapture={blockLegacyClick} onSubmitCapture={blockLegacySubmit}>
      {children}

      {syncError ? (
        <div
          role="alert"
          className="fixed inset-x-4 bottom-4 z-[90] mx-auto max-w-3xl rounded-2xl border border-red-500/40 bg-black/95 px-5 py-4 text-sm font-bold text-red-200 shadow-2xl"
        >
          Shared match state is unavailable. Gameplay controls are not authoritative until synchronization resumes: {syncError}
        </div>
      ) : null}

      {terminal ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 px-6 text-white">
          <div className="max-w-xl rounded-3xl border border-amber-500/30 bg-zinc-950 p-8 text-center shadow-2xl">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-amber-300">
              Match paused safely
            </p>
            <h2 className="mt-4 text-3xl font-black">
              The authoritative match cannot continue.
            </h2>
            <p className="mt-4 leading-7 text-zinc-400">
              {view.blockedReason ??
                "The server closed this match at a safe boundary. No browser or animation can advance it."}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
