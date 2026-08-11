"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Film,
  Flame,
  LogOut,
  Play,
  Trophy,
} from "lucide-react";

import {
  leaveCurrentRoom,
  touchMovieBuffRoomPresence,
} from "@/lib/db/movieBuff";
import {
  findCurrentRoomId,
  getCurrentUserId,
  loadGameState,
} from "@/lib/game/gameState";
import { getCurrentMovieBuffRound } from "@/lib/game/roundService";
import { supabase } from "@/lib/supabase";

export default function RoundIntroPage() {
  const router = useRouter();
  const isMountedRef = useRef(false);
  const [roomId, setRoomId] = useState("");
  const [round, setRound] = useState(1);
  const [totalRounds, setTotalRounds] = useState(10);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState("");

  const navigateTo = useCallback((
    destination: string,
    replace = false
  ) => {
    if (!isMountedRef.current) {
      return;
    }

    if (replace) {
      router.replace(destination);
      return;
    }

    router.push(destination);
  }, [router]);

  const playRoundHref = useMemo(() => {
    if (!roomId) {
      return "/games/movie-buff/lobby";
    }

    return `/games/movie-buff/board-preview?roomId=${encodeURIComponent(
      roomId
    )}&round=${encodeURIComponent(String(round))}`;
  }, [roomId, round]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadIntro() {
      try {
        const params = new URLSearchParams(window.location.search);
        let resolvedRoomId = params.get("roomId") ?? "";

        const playerId = await getCurrentUserId();

        if (!active || !isMountedRef.current) {
          return;
        }

        if (!resolvedRoomId) {
          resolvedRoomId =
            (await findCurrentRoomId(playerId)) ?? "";
        }

        if (!active || !isMountedRef.current) {
          return;
        }

        if (!resolvedRoomId) {
          navigateTo(
            "/games/movie-buff/lobby",
            true
          );
          return;
        }

        try {
          await touchMovieBuffRoomPresence(
            resolvedRoomId
          );
        } catch {}

        const game = await loadGameState(
          resolvedRoomId,
          playerId
        );

        if (!active || !isMountedRef.current) {
          return;
        }

        setError("");
        setRoomId(resolvedRoomId);
        setRound(Math.max(game.room.current_round, 1));
        setTotalRounds(game.room.total_rounds);
        setStreak(game.currentPlayer?.current_streak ?? 0);

        void getCurrentMovieBuffRound(
          resolvedRoomId
        )
          .then((currentRound) => {
            const nextClipType =
              currentRound.clipType.toLowerCase();
            const nextMediaUrl =
              currentRound.mediaUrl?.trim() ??
              "";

            if (
              !nextMediaUrl ||
              !["video", "audio"].includes(
                nextClipType
              ) ||
              !nextMediaUrl.startsWith(
                "/api/movie-buff/"
              )
            ) {
              return;
            }

            return fetch(nextMediaUrl, {
              method: "HEAD",
              cache: "no-store",
            });
          })
          .catch(() => {
            // Pre-warming generated clip media is best-effort only.
          });
      } catch (loadError) {
        if (!active || !isMountedRef.current) {
          return;
        }

        if (
          loadError instanceof Error &&
          loadError.message ===
            "You must sign in with a Buff Games account to continue."
        ) {
          const nextTarget = encodeURIComponent(
            `/games/movie-buff/round-intro${window.location.search}`,
          );
          navigateTo(
            `/sign-in?next=${nextTarget}`
            ,
            true
          );
          return;
        }

        console.error(loadError);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to prepare the round."
        );
      } finally {
        if (active && isMountedRef.current) {
          setLoading(false);
        }
      }
    }

    void loadIntro();

    return () => {
      active = false;
      void supabase.removeAllChannels();
    };
  }, [navigateTo]);

  useEffect(() => {
    if (!roomId) {
      return;
    }

    const presenceTimer = window.setInterval(
      () => {
        void touchMovieBuffRoomPresence(
          roomId
        ).catch(() => {});
      },
      2000
    );

    return () => {
      window.clearInterval(presenceTimer);
    };
  }, [roomId]);

  function handleGoBack() {
    if (leaving) {
      return;
    }

    navigateTo("/games/movie-buff/lobby");
  }

  async function handleLeaveMatch() {
    if (leaving) {
      return;
    }

    const resolvedRoomId =
      roomId ||
      new URLSearchParams(window.location.search).get(
        "roomId"
      ) ||
      "";

    if (!resolvedRoomId) {
      navigateTo("/games/movie-buff/lobby");
      return;
    }

    setLeaving(true);
    setError("");

    try {
      await leaveCurrentRoom(resolvedRoomId);
      navigateTo("/games/movie-buff/lobby");
    } catch (leaveError) {
      setError(
        leaveError instanceof Error
          ? leaveError.message
          : "Unable to leave the match."
      );
    } finally {
      setLeaving(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <p className="text-2xl font-black">Preparing round...</p>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black px-6 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(220,38,38,0.22),_transparent_55%)]" />
      <div className="absolute left-0 top-0 h-full w-1/3 bg-gradient-to-r from-red-950/60 to-transparent" />
      <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-red-950/60 to-transparent" />

      <section className="relative z-10 w-full max-w-5xl text-center">
        <div className="mb-8 flex flex-col justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={handleGoBack}
            disabled={leaving}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-700 px-5 py-3 text-sm font-black text-zinc-300 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ArrowLeft size={18} />
            Go Back
          </button>

          <button
            type="button"
            onClick={handleLeaveMatch}
            disabled={leaving}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-5 py-3 text-sm font-black text-red-200 transition hover:border-red-400 hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <LogOut size={18} />
            {leaving ? "Leaving..." : "Leave Match"}
          </button>
        </div>

        {error ? (
          <div className="mx-auto mb-8 max-w-2xl rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm font-bold text-red-200">
            {error}
          </div>
        ) : null}

        <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-full border border-red-500/50 bg-red-600/20 shadow-2xl shadow-red-600/30">
          <Film size={38} className="text-red-500" />
        </div>

        <p className="text-sm font-black uppercase tracking-[0.5em] text-red-500">
          Movie Buff Presents
        </p>

        <h1 className="mt-5 text-7xl font-black uppercase tracking-tight md:text-9xl">
          Round {round}
        </h1>

        <p className="mt-4 text-zinc-500">
          {round} of {totalRounds}
        </p>

        <div className="mx-auto mt-6 h-1 w-32 rounded-full bg-red-600" />

        <h2 className="mt-8 text-3xl font-black text-zinc-200 md:text-5xl">
          Movie Challenge
        </h2>

        <p className="mx-auto mt-5 max-w-2xl text-lg text-zinc-400">
          Watch the clip. Identify the movie. Beat the clock.
        </p>

        <div className="mx-auto mt-10 grid max-w-3xl gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-5">
            <Play className="mx-auto text-red-500" />
            <p className="mt-3 text-sm text-zinc-500">
              Answer Time
            </p>
            <p className="text-xl font-black">30 Seconds</p>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-5">
            <Flame className="mx-auto text-orange-500" />
            <p className="mt-3 text-sm text-zinc-500">
              Current Streak
            </p>
            <p className="text-xl font-black">
              {streak} Correct
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-5">
            <Trophy className="mx-auto text-yellow-400" />
            <p className="mt-3 text-sm text-zinc-500">
              Points Available
            </p>
            <p className="text-xl font-black">1,000</p>
          </div>
        </div>

        <div className="mt-10 rounded-3xl border border-red-700/50 bg-gradient-to-br from-red-950/50 via-zinc-950 to-black p-6">
          <p className="text-sm font-black uppercase tracking-[0.3em] text-red-400">
            Buff Says
          </p>

          <p className="mt-3 text-2xl font-black">
            Board first. Then clip. Then answer before time expires.
          </p>
        </div>

        <div className="mt-10 flex justify-center">
          <Link
            href={playRoundHref}
            className="flex w-full max-w-sm items-center justify-center gap-3 rounded-xl bg-red-600 px-8 py-5 text-xl font-black transition hover:bg-red-700"
          >
            Start Round
            <ArrowRight size={24} />
          </Link>
        </div>
      </section>
    </main>
  );
}
