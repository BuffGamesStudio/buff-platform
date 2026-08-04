"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Clock3, Film, Gamepad2, LockKeyhole, LogOut, ShieldAlert, X } from "lucide-react";

import { leaveCurrentRoom } from "@/lib/db/movieBuff";
import { findCurrentRoomId, getCurrentUserId } from "@/lib/game/gameState";
import {
  getMovieBuffVipRoundView,
  lockMovieBuffRoundVip,
  type MovieBuffVipRoundView,
} from "@/lib/game/movieBuffVipService";
import { getCurrentMovieBuffRound } from "@/lib/game/roundService";

function createActionKey(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export default function RoundIntroPage() {
  const router = useRouter();
  const [roomId, setRoomId] = useState("");
  const [roundId, setRoundId] = useState("");
  const [roundNumber, setRoundNumber] = useState(1);
  const [totalRounds, setTotalRounds] = useState(1);
  const [view, setView] = useState<MovieBuffVipRoundView | null>(null);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [nowMs, setNowMs] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [lockingVipId, setLockingVipId] = useState<string | null | undefined>();
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const navigate = useCallback(
    (destination: string, replace = false) => {
      if (replace) {
        router.replace(destination);
      } else {
        router.push(destination);
      }
    },
    [router],
  );

  const refresh = useCallback(async (resolvedRoomId = roomId, resolvedRoundId = roundId) => {
    if (!resolvedRoomId || !resolvedRoundId) return;
    const nextView = await getMovieBuffVipRoundView(resolvedRoomId, resolvedRoundId);
    setView(nextView);
    setClockOffsetMs(new Date(nextView.serverNow).getTime() - Date.now());
  }, [roomId, roundId]);

  useEffect(() => {
    let active = true;

    async function initialize() {
      try {
        const params = new URLSearchParams(window.location.search);
        const playerId = await getCurrentUserId();
        const resolvedRoomId =
          params.get("roomId") ?? (await findCurrentRoomId(playerId)) ?? "";

        if (!resolvedRoomId) {
          navigate("/games/movie-buff/lobby", true);
          return;
        }

        const round = await getCurrentMovieBuffRound(resolvedRoomId);
        if (!active) return;

        setRoomId(resolvedRoomId);
        setRoundId(round.roundId);
        setRoundNumber(round.roundNumber);
        setTotalRounds(round.totalRounds);
        await refresh(resolvedRoomId, round.roundId);
      } catch (loadError) {
        if (loadError instanceof Error && loadError.message === "SIGN_IN_REQUIRED") {
          navigate(
            `/sign-in?next=${encodeURIComponent(`/games/movie-buff/round-intro${window.location.search}`)}`,
            true,
          );
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "Unable to load Round Intro.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void initialize();
    return () => {
      active = false;
    };
  }, [navigate, refresh]);

  useEffect(() => {
    if (!roomId || !roundId) return;
    const poll = window.setInterval(() => void refresh().catch(() => undefined), 1000);
    const clock = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(clock);
    };
  }, [refresh, roomId, roundId]);

  useEffect(() => {
    if (!view?.advanceReady || !roomId) return;
    const timeout = window.setTimeout(() => {
      navigate(
        `/games/movie-buff/board-preview?roomId=${encodeURIComponent(roomId)}&round=${encodeURIComponent(String(roundNumber))}`,
        true,
      );
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [navigate, roomId, roundNumber, view?.advanceReady]);

  const remainingSeconds = useMemo(() => {
    if (!view?.deadlineAt) return 0;
    return Math.max(
      0,
      Math.ceil((new Date(view.deadlineAt).getTime() - (nowMs + clockOffsetMs)) / 1000),
    );
  }, [clockOffsetMs, nowMs, view?.deadlineAt]);

  async function lock(vipId: string | null) {
    if (!roomId || !roundId || view?.lock || lockingVipId !== undefined) return;
    setLockingVipId(vipId);
    setError("");
    try {
      await lockMovieBuffRoundVip(
        roomId,
        roundId,
        vipId,
        createActionKey("vip-lock"),
      );
      await refresh();
    } catch (lockError) {
      setError(lockError instanceof Error ? lockError.message : "Unable to lock VIP.");
    } finally {
      setLockingVipId(undefined);
    }
  }

  async function leaveMatch() {
    if (!roomId || leaving) return;
    setLeaving(true);
    try {
      await leaveCurrentRoom(roomId);
      navigate("/games/movie-buff/lobby", true);
    } catch (leaveError) {
      setError(leaveError instanceof Error ? leaveError.message : "Unable to leave match.");
      setLeaving(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <p className="text-2xl font-black">Synchronizing Round Intro...</p>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-black px-5 py-8 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(220,38,38,0.25),_transparent_52%)]" />
      <section className="relative z-10 mx-auto max-w-6xl">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-red-400">Movie Buff Presents</p>
            <h1 className="mt-2 text-5xl font-black uppercase md:text-7xl">Round {roundNumber}</h1>
            <p className="mt-2 text-zinc-500">{roundNumber} of {totalRounds}</p>
          </div>
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 font-black"
          >
            <Gamepad2 size={19} /> Game Menu
          </button>
        </header>

        <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_300px]">
          <section className="rounded-3xl border border-red-500/25 bg-zinc-950/90 p-6 md:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.28em] text-red-400">Private VIP Selection</p>
                <h2 className="mt-3 text-3xl font-black">Choose from your owned VIPs</h2>
                <p className="mt-3 max-w-2xl text-zinc-400">
                  Your unused choice stays private. The server owns the lock and deadline.
                </p>
              </div>
              <Film className="text-red-500" size={38} />
            </div>

            {error ? (
              <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-200">
                {error}
              </div>
            ) : null}

            {view?.status === "unavailable" ? (
              <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5">
                <div className="flex gap-3">
                  <ShieldAlert className="shrink-0 text-amber-300" />
                  <div>
                    <p className="font-black text-amber-100">VIP selection is not available</p>
                    <p className="mt-2 text-sm leading-6 text-amber-100/70">
                      The server has not opened an authoritative VIP window or inventory model for this round. No placeholder VIPs were granted.
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            {view?.lock ? (
              <div className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6">
                <div className="flex items-center gap-3">
                  <LockKeyhole className="text-emerald-300" />
                  <div>
                    <p className="font-black text-emerald-100">Selection locked</p>
                    <p className="mt-1 text-emerald-100/70">
                      {view.lock.vipName ?? "No VIP this round"}. This same lock will be restored after reconnect.
                    </p>
                  </div>
                </div>
              </div>
            ) : view?.status === "open" ? (
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {view.inventory.map((item) => (
                  <button
                    key={item.vipId}
                    type="button"
                    disabled={!item.available || lockingVipId !== undefined}
                    onClick={() => void lock(item.vipId)}
                    className="rounded-2xl border border-zinc-800 bg-black p-5 text-left transition hover:border-red-400 disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xl font-black">{item.name}</p>
                        <p className="mt-2 text-sm leading-6 text-zinc-400">{item.description}</p>
                      </div>
                      <span className="rounded-full border border-zinc-700 px-3 py-1 text-xs font-black">×{item.quantityRemaining}</span>
                    </div>
                    <p className="mt-4 text-xs font-black uppercase tracking-[0.2em] text-red-300">
                      {item.available
                        ? lockingVipId === item.vipId
                          ? "Locking..."
                          : "Select and lock"
                        : item.unavailableReason ?? "Unavailable"}
                    </p>
                  </button>
                ))}

                <button
                  type="button"
                  disabled={lockingVipId !== undefined}
                  onClick={() => void lock(null)}
                  className="rounded-2xl border border-zinc-800 bg-black p-5 text-left transition hover:border-zinc-500 disabled:opacity-55"
                >
                  <p className="text-xl font-black">No VIP</p>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">Lock in without using inventory this round.</p>
                  <p className="mt-4 text-xs font-black uppercase tracking-[0.2em] text-zinc-300">
                    {lockingVipId === null ? "Locking..." : "Lock no VIP"}
                  </p>
                </button>
              </div>
            ) : null}
          </section>

          <aside className="space-y-5">
            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6 text-center">
              <Clock3 className="mx-auto text-red-400" size={34} />
              <p className="mt-4 text-xs font-black uppercase tracking-[0.25em] text-zinc-500">Server Countdown</p>
              <p className="mt-2 text-6xl font-black tabular-nums">{remainingSeconds}</p>
              <p className="mt-3 text-sm text-zinc-400">
                Refreshing this page cannot extend the deadline.
              </p>
            </div>

            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-zinc-500">Lock Status</p>
              <p className="mt-3 text-2xl font-black">
                {view?.lockedCount ?? 0} / {view?.requiredPlayerCount ?? 0}
              </p>
              <p className="mt-3 text-sm leading-6 text-zinc-400">
                {view?.advanceReady
                  ? "Advancing automatically to the shared board..."
                  : view?.status === "closed"
                    ? "Deadline closed. Waiting for synchronized transition."
                    : "The match advances when everyone locks or the deadline expires."}
              </p>
              {view?.advanceReady ? <Check className="mt-4 text-emerald-400" /> : null}
            </div>
          </aside>
        </div>
      </section>

      {menuOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-5">
          <div className="w-full max-w-md rounded-3xl border border-zinc-700 bg-zinc-950 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black">Game Menu</h2>
              <button type="button" onClick={() => setMenuOpen(false)} aria-label="Close game menu">
                <X />
              </button>
            </div>
            <button
              type="button"
              onClick={() => navigate("/games/movie-buff/how-to-play")}
              className="mt-6 w-full rounded-xl border border-zinc-700 px-5 py-4 font-black"
            >
              How to Play
            </button>
            <button
              type="button"
              disabled={leaving}
              onClick={() => void leaveMatch()}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-5 py-4 font-black text-red-200 disabled:opacity-50"
            >
              <LogOut size={18} /> {leaving ? "Leaving..." : "Leave Match"}
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
