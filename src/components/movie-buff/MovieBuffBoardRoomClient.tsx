"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  selectMovieBuffAuthoritativeTile,
  type MovieBuffAuthoritativePhaseView,
} from "@/lib/game/movieBuffAuthoritativePhaseClient";
import { supabase } from "@/lib/supabase";

type Preview = {
  headline: string;
  supportLine: string;
  currentTurnLabel: string;
  boardStatusLabel: string;
  players: Array<{
    id: string;
    name: string;
    tier: string;
    score: number;
    isCurrentSelector: boolean;
  }>;
  categories: Array<{
    id: string;
    label: string;
    tiles: Array<{
      id: string;
      pointValue: number;
      tierLabel: string;
      status: "available" | "locked" | "used";
    }>;
  }>;
};

type MatchViewResponse = {
  view: MovieBuffAuthoritativePhaseView;
  board: {
    boardId: string;
    preview: Preview;
  };
};

async function loadMatchView(roomId: string): Promise<MatchViewResponse> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token || session.user.is_anonymous === true) {
    throw new Error("SIGN_IN_REQUIRED");
  }

  const response = await fetch("/api/movie-buff/match/view", {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ roomId }),
  });
  const payload = (await response.json().catch(() => null)) as
    | (MatchViewResponse & { error?: string })
    | null;

  if (!response.ok || !payload) {
    throw new Error(payload?.error ?? "Unable to load the shared board.");
  }

  return payload;
}

export default function MovieBuffBoardRoomClient({ roomId }: { roomId: string }) {
  const router = useRouter();
  const latestLoadRequestRef = useRef(0);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [phase, setPhase] = useState<MovieBuffAuthoritativePhaseView | null>(null);
  const [error, setError] = useState("");
  const [pendingTile, setPendingTile] = useState<string | null>(null);

  const load = useCallback(async () => {
    const requestId = ++latestLoadRequestRef.current;

    try {
      setError("");
      const result = await loadMatchView(roomId);

      if (requestId !== latestLoadRequestRef.current) return;

      setPreview(result.board.preview);
      setPhase(result.view);
    } catch (loadError) {
      if (requestId !== latestLoadRequestRef.current) return;

      if (loadError instanceof Error && loadError.message === "SIGN_IN_REQUIRED") {
        router.replace(
          `/sign-in?next=${encodeURIComponent(
            `/games/movie-buff/board-preview?roomId=${roomId}`,
          )}`,
        );
        return;
      }
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to synchronize the shared board.",
      );
    }
  }, [roomId, router]);

  useEffect(() => {
    let cancelled = false;
    let timeout: number | null = null;

    const poll = async () => {
      await load();

      if (!cancelled) {
        timeout = window.setTimeout(() => void poll(), 750);
      }
    };

    void poll();

    return () => {
      cancelled = true;
      latestLoadRequestRef.current += 1;
      if (timeout !== null) window.clearTimeout(timeout);
    };
  }, [load]);

  async function select(tileId: string) {
    if (!phase || phase.phase !== "board_select" || !phase.callerIsSelector) return;

    try {
      setPendingTile(tileId);
      setError("");
      await selectMovieBuffAuthoritativeTile(
        roomId,
        tileId,
        phase.phaseVersion,
      );
      await load();
    } catch (selectionError) {
      setError(
        selectionError instanceof Error
          ? selectionError.message
          : "Unable to select that tile.",
      );
      await load();
    } finally {
      setPendingTile(null);
    }
  }

  if (!preview || !phase) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
        <div className="max-w-xl text-center">
          <p className="text-2xl font-black">Synchronizing Movie Buff board...</p>
          {error ? <p className="mt-4 text-red-300">{error}</p> : null}
          {error ? (
            <button
              type="button"
              className="mt-5 rounded-xl bg-red-600 px-5 py-3 font-black"
              onClick={() => void load()}
            >
              Try Again
            </button>
          ) : null}
        </div>
      </main>
    );
  }

  const canSelect = phase.phase === "board_select" && phase.callerIsSelector;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(180,24,24,0.26),_transparent_28%),linear-gradient(180deg,_#080808_0%,_#000000_100%)] text-white">
      <section className="mx-auto max-w-[1600px] px-6 py-10">
        <div className="rounded-[2rem] border border-amber-500/25 bg-gradient-to-b from-red-950/55 via-[#140909] to-black p-8 shadow-[0_0_90px_rgba(239,68,68,0.14)]">
          <p className="text-sm font-black uppercase tracking-[0.35em] text-amber-300/90">
            Shared Game Board
          </p>
          <div className="mt-4 flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-4xl">
              <h1 className="text-4xl font-black leading-none md:text-6xl xl:text-7xl">
                {preview.headline}
              </h1>
              <p className="mt-4 text-lg text-zinc-300 md:text-2xl">
                {preview.supportLine}
              </p>
              <p className="mt-4 max-w-3xl text-sm uppercase tracking-[0.26em] text-zinc-500">
                Server-owned selector · atomic tile lock · synchronized clip
              </p>
            </div>
            <div className="grid min-w-[280px] gap-3 md:grid-cols-2 xl:grid-cols-1">
              <BoardStatusCard label="Current turn" value={preview.currentTurnLabel} accent="amber" />
              <BoardStatusCard label="Board status" value={preview.boardStatusLabel} accent="red" />
            </div>
          </div>

          {error ? (
            <div className="mt-6 max-w-3xl rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm font-bold text-red-200">
              {error}
            </div>
          ) : null}

          {!canSelect ? (
            <div className="mt-6 max-w-3xl rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm font-bold text-amber-100">
              You are watching the shared board. Only the current active human selector can choose a tile.
            </div>
          ) : null}

          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href="/games/movie-buff/how-to-play"
              className="rounded-xl border border-zinc-700 px-6 py-3 font-black text-zinc-200 transition hover:border-amber-400 hover:text-white"
            >
              How to Play
            </Link>
            <span className="rounded-xl border border-zinc-800 bg-black/50 px-6 py-3 text-sm font-black text-zinc-400">
              Phase v{phase.phaseVersion} · {phase.phase.replaceAll("_", " ")}
            </span>
          </div>
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="space-y-6">
            <div className="rounded-[2rem] border border-amber-500/20 bg-gradient-to-b from-[#161010] to-[#090909] p-6 shadow-[0_0_50px_rgba(245,158,11,0.08)]">
              <p className="text-xs font-black uppercase tracking-[0.3em] text-amber-300/90">
                Scoreboard
              </p>
              <div className="mt-5 space-y-3">
                {preview.players.map((player, index) => (
                  <div
                    key={player.id}
                    className={`rounded-2xl border px-4 py-4 ${
                      player.isCurrentSelector
                        ? "border-amber-400/40 bg-amber-500/10"
                        : "border-zinc-800 bg-black/70"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.22em] text-zinc-500">
                          Player {index + 1}
                        </p>
                        <p className="mt-1 text-xl font-black text-white">{player.name}</p>
                        <p className="mt-1 text-sm text-zinc-400">{player.tier}</p>
                      </div>
                      {player.isCurrentSelector ? (
                        <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.22em] text-amber-200">
                          Picking
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-4 flex items-end justify-between">
                      <span className="text-xs uppercase tracking-[0.22em] text-zinc-500">Score</span>
                      <span className="text-3xl font-black text-white">{player.score.toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          <div className="overflow-hidden rounded-[2rem] border border-zinc-800 bg-gradient-to-b from-[#111111] to-black p-4 shadow-[0_0_70px_rgba(120,0,0,0.14)] xl:p-5">
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-6">
              {preview.categories.map((category) => (
                <section
                  key={category.id}
                  className="overflow-hidden rounded-[1.7rem] border border-zinc-800 bg-[linear-gradient(180deg,rgba(23,23,23,0.98)_0%,rgba(7,7,7,1)_100%)]"
                >
                  <div className="border-b border-amber-500/20 bg-[linear-gradient(180deg,rgba(245,158,11,0.16)_0%,rgba(0,0,0,0)_100%)] px-4 py-4">
                    <p className="text-[11px] font-black uppercase tracking-[0.24em] text-zinc-500">Category</p>
                    <h3 className="mt-2 text-lg font-black leading-tight text-amber-100">{category.label}</h3>
                  </div>
                  <div className="grid gap-3 p-4">
                    {category.tiles.map((tile) => {
                      const isAvailable = tile.status === "available";
                      const isLocked = tile.status === "locked";
                      const isUsed = tile.status === "used";
                      const disabled = !isAvailable || pendingTile !== null || !canSelect;
                      const tileClassName = isUsed
                        ? "border-zinc-700 bg-[linear-gradient(180deg,rgba(45,45,45,0.95)_0%,rgba(7,7,7,1)_100%)] opacity-70"
                        : isLocked
                          ? "border-amber-400/70 bg-[linear-gradient(180deg,rgba(120,70,5,0.4)_0%,rgba(20,10,2,1)_100%)]"
                          : "border-red-500/25 bg-[linear-gradient(180deg,rgba(13,13,13,1)_0%,rgba(0,0,0,1)_100%)] hover:border-amber-400 hover:bg-[linear-gradient(180deg,rgba(53,8,8,1)_0%,rgba(12,3,3,1)_100%)]";

                      return (
                        <button
                          key={tile.id}
                          type="button"
                          disabled={disabled}
                          onClick={() => void select(tile.id)}
                          className={`group w-full rounded-[1.35rem] border px-4 py-4 text-left transition disabled:cursor-not-allowed ${tileClassName}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <span className="block text-[11px] font-black uppercase tracking-[0.22em] text-zinc-500">
                              {tile.tierLabel}
                            </span>
                            <span className="rounded-full border border-zinc-700 px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">
                              {isUsed ? "Scene Complete" : isLocked ? "Locked" : "Tile"}
                            </span>
                          </div>
                          <span className="mt-3 block text-3xl font-black leading-none text-white">{tile.pointValue}</span>
                          <span className="mt-2 block text-xs uppercase tracking-[0.2em] text-red-300/80">
                            {pendingTile === tile.id
                              ? "Locking scene..."
                              : isUsed
                                ? "Buster slate stamped"
                                : isLocked
                                  ? "Locked for the room"
                                  : canSelect
                                    ? "Select this scene"
                                    : "Waiting for selector"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function BoardStatusCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "amber" | "red";
}) {
  return (
    <div
      className={`rounded-2xl border px-4 py-4 ${
        accent === "amber"
          ? "border-amber-400/25 bg-amber-500/10"
          : "border-red-500/25 bg-red-500/10"
      }`}
    >
      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-zinc-500">{label}</p>
      <p className="mt-2 text-sm font-black leading-6 text-white">{value}</p>
    </div>
  );
}
