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

import type {
  MovieBuffBoardPreview,
  MovieBuffBoardTilePreview,
} from "@/lib/game/movieBuffBoard";
import { touchMovieBuffRoomPresence } from "@/lib/db/movieBuff";
import {
  buildMovieBuffPhaseRouteHref,
  getMovieBuffMatchPhaseView,
  selectMovieBuffMatchTile,
  type MovieBuffMatchPhaseView,
} from "@/lib/game/movieBuffPhaseService";

function getCountdownSeconds(
  deadline: string | null | undefined,
) {
  if (!deadline) {
    return null;
  }

  const milliseconds =
    new Date(deadline).getTime() - Date.now();

  if (!Number.isFinite(milliseconds)) {
    return null;
  }

  return Math.max(
    0,
    Math.ceil(milliseconds / 1000),
  );
}

function createSelectionIdempotencyKey() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `movie-buff-tile-${crypto.randomUUID()}`;
  }

  return `movie-buff-tile-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

export default function MovieBuffBoardPreviewClient({
  roomId,
  round,
  preview,
  initialSelectionError,
  boardLoadError,
}: {
  roomId: string | null;
  round: string | null;
  preview: MovieBuffBoardPreview;
  initialSelectionError: string | null;
  boardLoadError: string | null;
}) {
  const router = useRouter();
  const [phaseView, setPhaseView] =
    useState<MovieBuffMatchPhaseView | null>(null);
  const [phaseError, setPhaseError] =
    useState<string | null>(null);
  const [selectionError, setSelectionError] =
    useState<string | null>(
      initialSelectionError,
    );
  const [selectingTileId, setSelectingTileId] =
    useState<string | null>(null);
  const [, setNowTick] = useState(() =>
    Date.now(),
  );
  const boardReloadRequestedRef = useRef(false);

  useEffect(() => {
    if (
      !roomId ||
      boardReloadRequestedRef.current ||
      (boardLoadError !==
        "Board created but could not be reloaded" &&
        boardLoadError !==
          "Board already exists but could not be reloaded")
    ) {
      return;
    }

    boardReloadRequestedRef.current = true;

    const refreshTimer = window.setTimeout(() => {
      router.refresh();
    }, 500);

    return () => {
      window.clearTimeout(refreshTimer);
    };
  }, [boardLoadError, roomId, router]);

  const navigateToPhaseRoute = useCallback(
    (nextPhaseView: MovieBuffMatchPhaseView) => {
      const destination =
        buildMovieBuffPhaseRouteHref(
          nextPhaseView,
          roomId ?? undefined,
        );

      if (!destination) {
        return false;
      }

      if (
        nextPhaseView.phaseRoute ===
          "/games/movie-buff/round-intro" ||
        nextPhaseView.phaseRoute ===
          "/games/movie-buff/board-preview"
      ) {
        return false;
      }

      router.replace(destination);
      return true;
    },
    [roomId, router],
  );

  const refreshPhaseView = useCallback(
    async () => {
      if (!roomId) {
        return null;
      }

      try {
        await touchMovieBuffRoomPresence(roomId);
      } catch {}

      const nextPhaseView =
        await getMovieBuffMatchPhaseView(roomId);

      setPhaseView(nextPhaseView);
      setPhaseError(null);
      navigateToPhaseRoute(nextPhaseView);

      return nextPhaseView;
    },
    [navigateToPhaseRoute, roomId],
  );

  useEffect(() => {
    if (!roomId) {
      return;
    }

    let active = true;
    const initialRefresh =
      window.setTimeout(() => {
        void refreshPhaseView().catch((error) => {
          if (!active) {
            return;
          }

          setPhaseError(
            error instanceof Error
              ? error.message
              : "Unable to load the live round state.",
          );
        });
      }, 0);

    const phaseTimer = window.setInterval(() => {
      void refreshPhaseView().catch((error) => {
        if (!active) {
          return;
        }

        setPhaseError(
          error instanceof Error
            ? error.message
            : "Unable to refresh the live round state.",
        );
      });
    }, 1500);

    const countdownTimer =
      window.setInterval(() => {
        if (active) {
          setNowTick(Date.now());
        }
      }, 1000);

    return () => {
      active = false;
      window.clearTimeout(initialRefresh);
      window.clearInterval(phaseTimer);
      window.clearInterval(countdownTimer);
    };
  }, [refreshPhaseView, roomId]);

  const playerNameById = useMemo(
    () =>
      new Map(
        preview.players.map((player) => [
          player.id,
          player.name,
        ]),
      ),
    [preview.players],
  );

  const displayedPlayers = useMemo(() => {
    if (!phaseView) {
      return preview.players;
    }

    return preview.players.map((player) => {
      const participant =
        phaseView.participants.find(
          (candidate) =>
            candidate.playerId === player.id,
        ) ?? null;

      return {
        ...player,
        score:
          participant?.score ?? player.score,
        isCurrentSelector:
          participant?.isSelector ??
          player.isCurrentSelector,
      };
    });
  }, [phaseView, preview.players]);

  const usedTileCount = useMemo(
    () =>
      preview.categories.reduce(
        (total, category) =>
          total +
          category.tiles.filter(
            (tile) => tile.status === "used",
          ).length,
        0,
      ),
    [preview.categories],
  );

  const totalTileCount = useMemo(
    () =>
      preview.categories.reduce(
        (total, category) =>
          total + category.tiles.length,
        0,
      ),
    [preview.categories],
  );

  const selectorName = useMemo(() => {
    if (!phaseView?.selectorPlayerId) {
      return null;
    }

    return (
      playerNameById.get(
        phaseView.selectorPlayerId,
      ) ?? "Current selector"
    );
  }, [phaseView, playerNameById]);

  const boardStatusLabel = phaseView
    ? `Round ${phaseView.roundNumber} of ${phaseView.totalRounds} · ${usedTileCount} of ${totalTileCount} tiles used`
    : preview.boardStatusLabel;

  const currentTurnLabel = useMemo(() => {
    if (!phaseView) {
      return preview.currentTurnLabel;
    }

    if (phaseView.phase === "round_intro") {
      return "Round intro is live. The board unlocks after the intro window.";
    }

    if (phaseView.phase === "vip_lock") {
      return "VIP lock is in progress. The board opens after the lock window clears.";
    }

    if (phaseView.phase === "board_select") {
      if (phaseView.callerIsSelector) {
        return "It is your pick. Select the next playable tile.";
      }

      return selectorName
        ? `${selectorName} is choosing the next tile.`
        : "Waiting for the selector to choose the next tile.";
    }

    if (
      phaseView.phase === "transition" ||
      phaseView.phase === "playback" ||
      phaseView.phase === "answer"
    ) {
      return "The synchronized clip round is launching now.";
    }

    if (phaseView.phase === "results") {
      return "Round results are live.";
    }

    if (phaseView.phase === "blocked") {
      return (
        phaseView.blockedReason ??
        "The live round is blocked."
      );
    }

    return preview.currentTurnLabel;
  }, [
    phaseView,
    preview.currentTurnLabel,
    selectorName,
  ]);

  const boardPhaseCountdown =
    phaseView?.phase === "round_intro" ||
    phaseView?.phase === "vip_lock"
      ? getCountdownSeconds(
          phaseView.phaseEndsAt,
        )
      : phaseView?.phase === "board_select"
        ? getCountdownSeconds(
            phaseView.selectorDeadlineAt,
          )
        : null;

  const canSelectTiles =
    Boolean(roomId) &&
    !boardLoadError &&
    phaseView?.phase === "board_select" &&
    phaseView.callerIsSelector === true;

  const phaseBanner = useMemo(() => {
    if (boardLoadError) {
      return {
        tone: "red" as const,
        message: boardLoadError,
      };
    }

    if (selectionError) {
      return {
        tone: "red" as const,
        message: selectionError,
      };
    }

    if (phaseError) {
      return {
        tone: "amber" as const,
        message: phaseError,
      };
    }

    if (!roomId) {
      return null;
    }

    if (!phaseView) {
      return {
        tone: "amber" as const,
        message:
          "Checking the live Movie Buff phase for this room.",
      };
    }

    if (phaseView.phase === "round_intro") {
      return {
        tone: "amber" as const,
        message:
          boardPhaseCountdown === null
            ? "Round intro is live. The board unlocks automatically."
            : `Round intro is live. The board unlocks in ${boardPhaseCountdown}s.`,
      };
    }

    if (phaseView.phase === "vip_lock") {
      return {
        tone: "amber" as const,
        message:
          boardPhaseCountdown === null
            ? "VIP lock is in progress. The board opens automatically."
            : `VIP lock is in progress. The board opens in ${boardPhaseCountdown}s.`,
      };
    }

    if (phaseView.phase === "board_select") {
      if (phaseView.callerIsSelector) {
        return {
          tone: "amber" as const,
          message:
            boardPhaseCountdown === null
              ? "Choose a playable tile to launch the synchronized clip round."
              : `Choose a playable tile in ${boardPhaseCountdown}s to launch the synchronized clip round.`,
        };
      }

      return {
        tone: "amber" as const,
        message: selectorName
          ? `${selectorName} is choosing the next tile.`
          : "Waiting for the current selector to choose a tile.",
      };
    }

    return null;
  }, [
    boardLoadError,
    boardPhaseCountdown,
    phaseError,
    phaseView,
    roomId,
    selectionError,
    selectorName,
  ]);

  const handleSelectTile = useCallback(
    async (
      tile: MovieBuffBoardTilePreview,
    ) => {
      if (
        !roomId ||
        !phaseView ||
        !canSelectTiles ||
        selectingTileId
      ) {
        return;
      }

      if (!tile.clipId) {
        setSelectionError(
          "That tile does not have a playable rehearsal clip mapped.",
        );
        return;
      }

      setSelectingTileId(tile.id);
      setSelectionError(null);

      try {
        await selectMovieBuffMatchTile({
          roomId,
          tileId: tile.id,
          expectedVersion:
            phaseView.phaseVersion,
          idempotencyKey:
            createSelectionIdempotencyKey(),
        });

        router.replace(
          `/games/movie-buff/play?roomId=${encodeURIComponent(
            roomId,
          )}${
            round
              ? `&round=${encodeURIComponent(
                  round,
                )}`
              : ""
          }`,
        );
      } catch (error) {
        setSelectionError(
          error instanceof Error
            ? error.message
            : "Unable to select that tile.",
        );

        await refreshPhaseView().catch(() => null);
      } finally {
        setSelectingTileId(null);
      }
    },
    [
      canSelectTiles,
      phaseView,
      refreshPhaseView,
      roomId,
      round,
      router,
      selectingTileId,
    ],
  );

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(180,24,24,0.26),_transparent_28%),linear-gradient(180deg,_#080808_0%,_#000000_100%)] text-white">
      <section className="mx-auto max-w-[1600px] px-6 py-10">
        <div className="rounded-[2rem] border border-amber-500/25 bg-gradient-to-b from-red-950/55 via-[#140909] to-black p-8 shadow-[0_0_90px_rgba(239,68,68,0.14)]">
          <p className="text-sm font-black uppercase tracking-[0.35em] text-amber-300/90">
            Board-first preview
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
                Premium cinematic competition · synchronized clip play ·
                first-correct-wins
              </p>
            </div>

            <div className="grid min-w-[280px] gap-3 md:grid-cols-2 xl:grid-cols-1">
              <BoardStatusCard
                label="Current turn"
                value={currentTurnLabel}
                accent="amber"
              />
              <BoardStatusCard
                label="Board status"
                value={boardStatusLabel}
                accent="red"
              />
            </div>
          </div>

          {phaseBanner ? (
            <div
              className={`mt-6 max-w-3xl rounded-2xl px-5 py-4 text-sm font-bold ${
                phaseBanner.tone === "red"
                  ? "border border-red-500/30 bg-red-500/10 text-red-200"
                  : "border border-amber-500/30 bg-amber-500/10 text-amber-100"
              }`}
            >
              {phaseBanner.message}
            </div>
          ) : null}

          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href="/games/movie-buff/lobby"
              className="rounded-xl border border-zinc-700 px-6 py-3 font-black text-zinc-200 transition hover:border-amber-400 hover:text-white"
            >
              Current live flow
            </Link>
            <Link
              href="/games/movie-buff/how-to-play"
              className="rounded-xl border border-zinc-700 px-6 py-3 font-black text-zinc-200 transition hover:border-amber-400 hover:text-white"
            >
              How to Play
            </Link>
          </div>
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="space-y-6">
            <div className="rounded-[2rem] border border-amber-500/20 bg-gradient-to-b from-[#161010] to-[#090909] p-6 shadow-[0_0_50px_rgba(245,158,11,0.08)]">
              <p className="text-xs font-black uppercase tracking-[0.3em] text-amber-300/90">
                Scoreboard
              </p>
              <div className="mt-5 space-y-3">
                {displayedPlayers.map((player, index) => (
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
                        <p className="mt-1 text-xl font-black text-white">
                          {player.name}
                        </p>
                        <p className="mt-1 text-sm text-zinc-400">
                          {player.tier}
                        </p>
                      </div>
                      {player.isCurrentSelector ? (
                        <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.22em] text-amber-200">
                          Picking
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-4 flex items-end justify-between">
                      <span className="text-xs uppercase tracking-[0.22em] text-zinc-500">
                        Score
                      </span>
                      <span className="text-3xl font-black text-white">
                        {player.score.toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-red-700/40 bg-gradient-to-br from-red-950/35 via-zinc-950 to-black p-6">
              <p className="text-xs font-black uppercase tracking-[0.3em] text-red-300">
                Launch rule
              </p>
              <p className="mt-3 text-base font-black text-white">
                First correct answer wins the tile.
              </p>
              <p className="mt-3 text-sm leading-6 text-zinc-400">
                The rehearsal database owns the live phase machine. Tile
                selection only opens for the current selector during board
                selection.
              </p>
            </div>
          </aside>

          <div className="space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-amber-300">
                  Prototype board
                </h2>
                <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-400">
                  This board now waits on the authoritative rehearsal phase
                  state instead of bypassing directly into the clip round.
                </p>
                {roomId ? (
                  <p className="mt-3 max-w-4xl text-sm leading-6 text-amber-200/85">
                    Selectable tiles require a playable rehearsal clip. The app
                    moves into the synchronized clip round only after a valid
                    authoritative selection.
                  </p>
                ) : null}
              </div>
            </div>

            <div className="overflow-hidden rounded-[2rem] border border-zinc-800 bg-gradient-to-b from-[#111111] to-black p-4 shadow-[0_0_70px_rgba(120,0,0,0.14)] xl:p-5">
              <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-6">
                {preview.categories.map((category) => (
                  <section
                    key={category.id}
                    className="overflow-hidden rounded-[1.7rem] border border-zinc-800 bg-[linear-gradient(180deg,rgba(23,23,23,0.98)_0%,rgba(7,7,7,1)_100%)]"
                  >
                    <div className="border-b border-amber-500/20 bg-[linear-gradient(180deg,rgba(245,158,11,0.16)_0%,rgba(0,0,0,0)_100%)] px-4 py-4">
                      <p className="text-[11px] font-black uppercase tracking-[0.24em] text-zinc-500">
                        Category
                      </p>
                      <h3 className="mt-2 text-lg font-black leading-tight text-amber-100">
                        {category.label}
                      </h3>
                    </div>

                    <div className="grid gap-3 p-4">
                      {category.tiles.map((tile) => {
                        const hasPlayableClip =
                          Boolean(tile.clipId);
                        const isAvailable =
                          tile.status === "available";
                        const isLocked =
                          tile.status === "locked";
                        const isUsed =
                          tile.status === "used";
                        const isDisabledTile =
                          !hasPlayableClip &&
                          !isLocked &&
                          !isUsed;

                        const tileClassName = isUsed
                          ? "border-zinc-800 bg-zinc-950/80 opacity-55"
                          : isLocked
                            ? "border-amber-400/70 bg-[linear-gradient(180deg,rgba(120,70,5,0.4)_0%,rgba(20,10,2,1)_100%)]"
                            : isDisabledTile
                              ? "border-zinc-800 bg-zinc-950/60 opacity-65"
                              : "border-red-500/25 bg-[linear-gradient(180deg,rgba(13,13,13,1)_0%,rgba(0,0,0,1)_100%)] hover:border-amber-400 hover:bg-[linear-gradient(180deg,rgba(53,8,8,1)_0%,rgba(12,3,3,1)_100%)]";

                        const statusLabel = isUsed
                          ? "Used"
                          : isLocked
                            ? "Locked"
                            : isDisabledTile
                              ? "Unavailable"
                              : "Tile";

                        const body = (
                          <>
                            <div className="flex items-start justify-between gap-3">
                              <span className="block text-[11px] font-black uppercase tracking-[0.22em] text-zinc-500 transition group-hover:text-amber-200">
                                {tile.tierLabel}
                              </span>
                              <span className="rounded-full border border-zinc-800 px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
                                {statusLabel}
                              </span>
                            </div>
                            <span className="mt-3 block text-3xl font-black leading-none text-white">
                              {tile.pointValue}
                            </span>
                            <span className="mt-2 block text-xs uppercase tracking-[0.2em] text-red-300/80">
                              {isUsed
                                ? "This tile has already been played"
                                : isLocked
                                  ? "This tile is locked for the room"
                                  : isDisabledTile
                                    ? "Playable rehearsal clip unavailable"
                                    : canSelectTiles && isAvailable
                                      ? "Select to lock this round"
                                      : "Waiting for the live selector"}
                            </span>
                          </>
                        );

                        if (
                          !roomId ||
                          !isAvailable ||
                          !hasPlayableClip ||
                          !canSelectTiles
                        ) {
                          return (
                            <div
                              key={tile.id}
                              className={`group rounded-[1.35rem] border px-4 py-4 text-left transition ${tileClassName}`}
                            >
                              {body}
                            </div>
                          );
                        }

                        return (
                          <button
                            key={tile.id}
                            type="button"
                            onClick={() =>
                              void handleSelectTile(
                                tile,
                              )
                            }
                            disabled={
                              selectingTileId !==
                              null
                            }
                            className={`group w-full rounded-[1.35rem] border px-4 py-4 text-left transition disabled:cursor-not-allowed disabled:opacity-70 ${tileClassName}`}
                          >
                            {body}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
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
      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-zinc-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-black leading-6 text-white">
        {value}
      </p>
    </div>
  );
}
