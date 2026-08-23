"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Clapperboard, Clock3, Crown, LogOut, Radio, Users } from "lucide-react";

import { getCurrentUser, subscribeToAuthChanges } from "@/lib/auth/auth";
import {
  getMovieBuffLiveShowView,
  heartbeatMovieBuffLiveQueue,
  joinMovieBuffLiveQueue,
  leaveMovieBuffLiveQueue,
  type MovieBuffLiveShowView,
} from "@/lib/db/movieBuffLiveShow";

function formatPhase(phase: string | null): string {
  if (!phase) {
    return "Casting contestants";
  }

  return phase
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatShowStatus(status: string): string {
  return status
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "M")
    .join("");
}

function secondsUntil(iso: string | null, now: number): number | null {
  if (!iso) {
    return null;
  }

  return Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 1000));
}

export default function MovieBuffLiveShowClient() {
  const router = useRouter();
  const [view, setView] = useState<MovieBuffLiveShowView | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const nextView = await getMovieBuffLiveShowView();
      setView(nextView);
      setError("");
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "The live show status could not be refreshed.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => {
      void refresh();
    }, 0);

    const interval = window.setInterval(() => {
      setNow(Date.now());
      void refresh();
    }, 2500);

    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(interval);
    };
  }, [refresh]);

  useEffect(() => {
    const unsubscribe = subscribeToAuthChanges(() => {
      void refresh();
    });

    return unsubscribe;
  }, [refresh]);

  useEffect(() => {
    if (view?.myQueueStatus !== "queued" && view?.myQueueStatus !== "on_stage") {
      return;
    }

    const heartbeat = window.setInterval(() => {
      void heartbeatMovieBuffLiveQueue().catch(() => null);
    }, 20_000);

    return () => window.clearInterval(heartbeat);
  }, [view?.myQueueStatus]);

  const phaseSeconds = secondsUntil(view?.currentPhaseEndsAt ?? null, now);
  const isQueued = view?.myQueueStatus === "queued";
  const isOnStage = view?.myQueueStatus === "on_stage";
  const isCoolingDown = view?.myQueueStatus === "cooldown";

  const actionLabel = useMemo(() => {
    if (working) {
      return "Working...";
    }

    if (isQueued) {
      return "In the Queue";
    }

    if (isOnStage) {
      return "On Stage";
    }

    if (isCoolingDown) {
      return "Cooldown Active";
    }

    return "Join Contestant Queue";
  }, [isCoolingDown, isOnStage, isQueued, working]);

  async function handleQueueAction() {
    if (working || isOnStage) {
      return;
    }

    setWorking(true);
    setError("");

    try {
      const user = await getCurrentUser();

      if (!user) {
        router.push(
          `/sign-in?next=${encodeURIComponent("/games/movie-buff/live")}`,
        );
        return;
      }

      if (isQueued) {
        await leaveMovieBuffLiveQueue();
      } else {
        await joinMovieBuffLiveQueue();
      }

      await refresh();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "The contestant queue action failed.",
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#05050a] text-white">
      <div className="pointer-events-none fixed inset-0 opacity-70 [background:radial-gradient(circle_at_top,#31204a_0%,transparent_42%),linear-gradient(115deg,rgba(122,15,42,.24),transparent_30%,rgba(12,56,94,.24))]" />

      <div className="relative mx-auto max-w-7xl px-5 py-6 sm:px-8 lg:py-10">
        <header className="mb-8 flex flex-col gap-5 border-b border-white/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link
              href="/games/movie-buff"
              className="mb-4 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.24em] text-amber-300 transition hover:text-white"
            >
              <Clapperboard size={16} />
              Movie Buff
            </Link>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-rose-300">
              The live studio
            </p>
            <h1 className="mt-2 text-4xl font-black tracking-tight sm:text-6xl">
              Movie Buff Live
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-zinc-300 sm:text-lg">
              Join the contestant row, get selected for the next three-seat
              episode, and play on the same authoritative Movie Buff stage.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start rounded-full border border-emerald-400/40 bg-emerald-400/10 px-4 py-2 text-sm font-black uppercase tracking-[0.2em] text-emerald-300 sm:self-auto">
            <Radio size={16} className="animate-pulse" />
            {view ? formatShowStatus(view.status) : "Connecting"}
          </div>
        </header>

        {error ? (
          <div className="mb-6 rounded-2xl border border-rose-500/50 bg-rose-950/50 px-5 py-4 text-sm font-semibold text-rose-100">
            {error}
          </div>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-[1.35fr_.65fr]">
          <div className="rounded-[2rem] border border-amber-300/30 bg-gradient-to-br from-[#1b101a] via-[#0c1223] to-[#060914] p-5 shadow-2xl shadow-black/40 sm:p-8">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.3em] text-amber-300">
                  On stage now
                </p>
                <h2 className="mt-2 text-3xl font-black sm:text-4xl">
                  Episode {view?.episodeNumber ?? 0}
                </h2>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-right">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">
                  Queue
                </p>
                <p className="mt-1 text-2xl font-black text-white">
                  {view?.queueCount ?? "—"}
                </p>
              </div>
            </div>

            <div className="mb-6 grid gap-4 sm:grid-cols-3">
              {(view?.contestants ?? []).map((contestant) => (
                <div
                  key={contestant.seatIndex}
                  className="rounded-2xl border border-white/15 bg-black/25 p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-amber-300/60 bg-amber-300/15 text-sm font-black text-amber-200">
                      {contestant.avatarUrl ? (
                        // The URL is supplied by the player profile and is only
                        // used as a decorative live-stage avatar.
                        <span className="text-xs">{initials(contestant.displayName)}</span>
                      ) : (
                        initials(contestant.displayName)
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-black">{contestant.displayName}</p>
                      <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                        Seat {contestant.seatIndex}
                      </p>
                    </div>
                  </div>
                  <p className="mt-4 text-2xl font-black text-amber-200">
                    {contestant.score.toLocaleString()}
                  </p>
                  <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                    Points
                  </p>
                </div>
              ))}

              {!view?.contestants.length ? (
                <div className="sm:col-span-3 rounded-2xl border border-dashed border-white/15 bg-black/20 p-8 text-center text-zinc-400">
                  The studio is casting the next three contestants.
                </div>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-rose-300/20 bg-rose-950/20 p-5">
                <p className="text-xs font-black uppercase tracking-[0.24em] text-rose-300">
                  Current scene
                </p>
                <p className="mt-2 text-2xl font-black">
                  {view ? formatPhase(view.currentPhase) : "Loading"}
                </p>
                {phaseSeconds !== null ? (
                  <p className="mt-2 flex items-center gap-2 text-sm text-zinc-400">
                    <Clock3 size={15} />
                    {phaseSeconds}s remaining
                  </p>
                ) : null}
              </div>

              <div className="rounded-2xl border border-sky-300/20 bg-sky-950/20 p-5">
                <p className="text-xs font-black uppercase tracking-[0.24em] text-sky-300">
                  Format
                </p>
                <p className="mt-2 text-2xl font-black">3 contestants</p>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  When an episode closes, all seats rotate through a cooldown
                  before the next casting call.
                </p>
              </div>
            </div>

            {view?.roomId ? (
              <Link
                href={`/games/movie-buff/board-preview?roomId=${encodeURIComponent(view.roomId)}`}
                className="mt-5 inline-flex items-center gap-2 rounded-xl border border-amber-300/40 bg-amber-300/10 px-4 py-3 text-sm font-black text-amber-200 transition hover:bg-amber-300/20"
              >
                <Clapperboard size={16} />
                Open the live board
              </Link>
            ) : null}

            <Link
              href="/games/movie-buff/broadcast"
              className="mt-3 inline-flex items-center gap-2 rounded-xl border border-sky-300/35 bg-sky-300/10 px-4 py-3 text-sm font-black text-sky-200 transition hover:bg-sky-300/20"
            >
              <Radio size={16} />
              Open broadcast composition
            </Link>
          </div>

          <aside className="rounded-[2rem] border border-white/10 bg-white/[.04] p-5 sm:p-7">
            <div className="mb-6 flex items-center gap-3">
              <div className="rounded-2xl bg-amber-300/15 p-3 text-amber-200">
                <Users size={24} />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-amber-300">
                  Contestant row
                </p>
                <h2 className="text-2xl font-black">Your place in the show</h2>
              </div>
            </div>

            <p className="text-sm leading-7 text-zinc-300">
              Keep this page open while you wait. The show runner refreshes the
              queue and the live scene from the server instead of relying on a
              browser tab to advance the game.
            </p>

            <div className="mt-6 rounded-2xl border border-white/10 bg-black/25 p-5">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-zinc-500">
                Your status
              </p>
              <p className="mt-2 text-2xl font-black text-white">
                {view?.myQueueStatus === "queued"
                  ? `Queued${view.myQueuePosition ? ` · #${view.myQueuePosition}` : ""}`
                  : view?.myQueueStatus === "on_stage"
                    ? "On stage"
                    : view?.myQueueStatus === "cooldown"
                      ? "Cooldown"
                      : "Not queued"}
              </p>
            </div>

            <button
              type="button"
              onClick={handleQueueAction}
              disabled={loading || working || isOnStage || isCoolingDown}
              className="mt-6 flex w-full items-center justify-center gap-3 rounded-2xl bg-amber-300 px-5 py-4 text-base font-black text-black transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isOnStage ? <Crown size={18} /> : <Users size={18} />}
              {actionLabel}
            </button>

            {isQueued ? (
              <button
                type="button"
                onClick={handleQueueAction}
                disabled={working}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 px-5 py-3 text-sm font-black text-zinc-300 transition hover:border-rose-300/50 hover:text-white disabled:opacity-50"
              >
                <LogOut size={16} />
                Leave Queue
              </button>
            ) : null}

            {isCoolingDown ? (
              <p className="mt-4 text-center text-sm leading-6 text-zinc-400">
                You can rejoin after the current contestant cooldown ends.
              </p>
            ) : null}

            <div className="mt-8 border-t border-white/10 pt-6 text-sm leading-6 text-zinc-500">
              <p className="font-bold text-zinc-300">Stage systems</p>
              <p className="mt-2">
                Supabase owns the queue and match clock. The persistent runner
                owns episode rotation. The public broadcast and AI host are
                separate delivery layers that can attach to this stage.
              </p>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
