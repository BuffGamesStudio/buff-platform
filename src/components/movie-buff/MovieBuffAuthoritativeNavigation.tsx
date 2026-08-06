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
  confirmMovieBuffActiveLeave,
  getMovieBuffActiveLeaveQuote,
  getMovieBuffAuthoritativePhase,
  type MovieBuffActiveLeaveQuote,
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
  "/games/movie-buff/board-preview",
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
  const [leaveQuote, setLeaveQuote] = useState<MovieBuffActiveLeaveQuote | null>(
    null,
  );
  const [leaveError, setLeaveError] = useState("");
  const [leaveBusy, setLeaveBusy] = useState(false);
  const syncing = useRef(false);
  const leaving = useRef(false);
  const leaveIdempotencyKey = useRef("");

  const synchronize = useCallback(async () => {
    if (!shouldSynchronize || syncing.current || leaving.current) return;
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
      setLeaveQuote(null);
      setLeaveError("");
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

  async function openLeaveConfirmation() {
    if (!roomId || leaveBusy) return;
    setLeaveBusy(true);
    setLeaveError("");

    try {
      const quote = await getMovieBuffActiveLeaveQuote(roomId);
      leaveIdempotencyKey.current = `active-leave-${crypto.randomUUID()}`;
      setLeaveQuote(quote);
    } catch (error) {
      setLeaveError(
        error instanceof Error
          ? error.message
          : "The server could not quote an active-match leave.",
      );
    } finally {
      setLeaveBusy(false);
    }
  }

  async function confirmLeave() {
    if (!leaveQuote || leaveBusy) return;
    setLeaveBusy(true);
    setLeaveError("");

    try {
      await confirmMovieBuffActiveLeave(
        leaveQuote.quoteToken,
        leaveIdempotencyKey.current,
      );
      leaving.current = true;
      setLeaveQuote(null);
      router.replace("/games/movie-buff");
    } catch (error) {
      setLeaveError(
        error instanceof Error
          ? error.message
          : "The server rejected the active-match leave confirmation.",
      );
    } finally {
      setLeaveBusy(false);
    }
  }

  const terminal = view?.phase === "blocked" || view?.phase === "abandoned";
  const showLeave = Boolean(
    shouldSynchronize && view && !terminal && view.phase !== "finished",
  );

  return (
    <div onClickCapture={blockLegacyClick} onSubmitCapture={blockLegacySubmit}>
      {children}

      {showLeave ? (
        <button
          type="button"
          onClick={() => void openLeaveConfirmation()}
          disabled={leaveBusy}
          className="fixed right-4 top-4 z-[85] rounded-full border border-white/20 bg-black/80 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-white shadow-xl backdrop-blur disabled:cursor-wait disabled:opacity-60"
        >
          {leaveBusy && !leaveQuote ? "Checking leave…" : "Leave match"}
        </button>
      ) : null}

      {leaveError && !leaveQuote ? (
        <div
          role="alert"
          className="fixed right-4 top-16 z-[90] max-w-sm rounded-2xl border border-red-500/40 bg-black/95 px-4 py-3 text-sm font-semibold text-red-200 shadow-2xl"
        >
          {leaveError}
        </div>
      ) : null}

      {leaveQuote ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="movie-buff-leave-title"
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/85 px-6"
        >
          <div className="w-full max-w-lg rounded-3xl border border-amber-400/30 bg-zinc-950 p-7 text-white shadow-2xl">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-amber-300">
              Active match
            </p>
            <h2 id="movie-buff-leave-title" className="mt-3 text-3xl font-black">
              Leave this match?
            </h2>
            <p className="mt-4 leading-7 text-zinc-300">
              The server will deduct {leaveQuote.penaltyPoints} points under policy {leaveQuote.policyVersion}. Your seat becomes abandoned and cannot be resumed; Buster takes over only at an authoritative safe boundary.
            </p>
            <p className="mt-3 text-xs text-zinc-500">
              Quote expires {new Date(leaveQuote.expiresAt).toLocaleTimeString()}.
            </p>

            {leaveError ? (
              <p role="alert" className="mt-4 text-sm font-bold text-red-300">
                {leaveError}
              </p>
            ) : null}

            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setLeaveQuote(null);
                  setLeaveError("");
                }}
                disabled={leaveBusy}
                className="rounded-full border border-white/20 px-5 py-3 text-sm font-black disabled:opacity-60"
              >
                Stay in match
              </button>
              <button
                type="button"
                onClick={() => void confirmLeave()}
                disabled={leaveBusy}
                className="rounded-full bg-red-600 px-5 py-3 text-sm font-black text-white disabled:cursor-wait disabled:opacity-60"
              >
                {leaveBusy ? "Leaving…" : "Confirm leave"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
