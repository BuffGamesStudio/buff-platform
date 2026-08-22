"use client";

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

  const leaderboardPlayers = useMemo(
    () =>
      displayedPlayers
        .map((player, index) => ({
          ...player,
          originalIndex: index,
        }))
        .sort(
          (left, right) =>
            right.score - left.score ||
            left.originalIndex - right.originalIndex,
        ),
    [displayedPlayers],
  );

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
      return "Preparing the round board.";
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
    phaseView?.phase === "round_intro"
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
        message: "Preparing the round board. The board will open automatically.",
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
    <main
      data-testid="movie-buff-live-board"
      className="movie-buff-theater-board min-h-screen text-white"
    >
      <div className="movie-buff-theater-backdrop" aria-hidden="true">
        <div className="movie-buff-theater-arch movie-buff-theater-arch--left" />
        <div className="movie-buff-theater-arch movie-buff-theater-arch--right" />
        <div className="movie-buff-theater-screen-glow" />
      </div>

      <section className="movie-buff-theater-shell mx-auto max-w-[1800px]">
        <header className="movie-buff-board-marquee">
          <div>
            <p className="text-lg font-black uppercase tracking-[0.16em] text-white">
              Movie Buff
            </p>
            <p className="mt-1 text-[11px] font-black uppercase tracking-[0.24em] text-red-300">
              Live board / round {phaseView?.roundNumber ?? "Preview"}
            </p>
          </div>

          <div className="text-left md:text-right">
            <p className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.18em] text-emerald-300 md:justify-end">
              <span className="movie-buff-live-dot" aria-hidden="true" />
              Live
            </p>
            <p className="mt-1 text-xs leading-5 text-zinc-400">
              {boardStatusLabel}
            </p>
          </div>
        </header>

        <div className="movie-buff-board-layout">
          <aside className="movie-buff-side-panel movie-buff-player-panel">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-amber-300">
                  Players
                </p>
                <p className="mt-2 text-sm uppercase tracking-[0.16em] text-zinc-400">
                  {displayedPlayers.length} active
                </p>
              </div>
              <span className="text-2xl" aria-hidden="true">
                ◉
              </span>
            </div>

            <div className="mt-5 space-y-3">
              {displayedPlayers.map((player, index) => (
                <div
                  key={player.id}
                  className={`movie-buff-player-card ${
                    player.isCurrentSelector
                      ? "movie-buff-player-card--active"
                      : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
                        {index + 1}
                      </p>
                      <p className="mt-1 truncate text-base font-black text-white">
                        {player.name}
                      </p>
                      <p className="mt-1 text-xs text-zinc-400">
                        {player.tier}
                      </p>
                    </div>
                    {player.isCurrentSelector ? (
                      <span className="movie-buff-picking-badge">Picking</span>
                    ) : null}
                  </div>
                  <div className="mt-4 flex items-end justify-between">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
                      Points
                    </span>
                    <span className="text-2xl font-black text-amber-100">
                      {player.score.toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="movie-buff-side-note mt-5">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-300">
                Current pick
              </p>
              <p className="mt-2 text-sm font-bold text-white">
                {selectorName
                  ? `${selectorName} is choosing`
                  : "Waiting for the live selector"}
              </p>
            </div>
          </aside>

          <section
            className="movie-buff-board-stage"
            aria-label="Movie category board"
          >
            <div className="movie-buff-board-callouts">
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

            {phaseBanner ? (
              <div
                className={`movie-buff-board-phase-banner ${
                  phaseBanner.tone === "red"
                    ? "movie-buff-board-phase-banner--red"
                    : "movie-buff-board-phase-banner--amber"
                }`}
              >
                {phaseBanner.message}
              </div>
            ) : null}

            <div className="movie-buff-board-grid">
              {preview.categories.map((category) => (
                <section
                  key={category.id}
                  className="movie-buff-board-column"
                  aria-label={`${category.label} movie category`}
                >
                  <div className="movie-buff-board-column__header">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-200">
                      Genre
                    </p>
                    <h2 className="mt-1 text-base font-black uppercase tracking-[0.08em] text-amber-100">
                      {category.label}
                    </h2>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                      {category.primaryGenre ?? category.eraBucket ?? "Movies"}
                    </p>
                  </div>

                  <div className="movie-buff-board-column__tiles">
                    {category.tiles.map((tile) => {
                      const hasPlayableClip = Boolean(tile.clipId);
                      const isAvailable = tile.status === "available";
                      const isLocked = tile.status === "locked";
                      const isUsed = tile.status === "used";
                      const isDisabledTile =
                        !hasPlayableClip && !isLocked && !isUsed;

                      const tileClassName = isUsed
                        ? "movie-buff-board-tile movie-buff-board-tile--used"
                        : isLocked
                          ? "movie-buff-board-tile movie-buff-board-tile--locked"
                          : isDisabledTile
                            ? "movie-buff-board-tile movie-buff-board-tile--disabled"
                            : "movie-buff-board-tile";

                      const statusLabel = isUsed
                        ? "Used"
                        : isLocked
                          ? "Locked"
                          : isDisabledTile
                            ? "Unavailable"
                            : "Available";

                      const statusText = isUsed
                        ? "Already played"
                        : isLocked
                          ? "Locked for room"
                          : isDisabledTile
                            ? "Clip unavailable"
                            : canSelectTiles && isAvailable
                              ? "Select tile"
                              : "Waiting for selector";

                      const body = (
                        <>
                          <span className="movie-buff-board-tile__meta">
                            {tile.tierLabel}
                            <span className="movie-buff-board-tile__state">
                              {statusLabel}
                            </span>
                          </span>
                          <span className="movie-buff-board-tile__points">
                            {tile.pointValue}
                          </span>
                          <span className="movie-buff-board-tile__action">
                            {statusText}
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
                            data-testid="movie-buff-tile"
                            data-category={category.label}
                            data-points={String(tile.pointValue)}
                            data-tile-id={tile.id}
                            className={tileClassName}
                            aria-label={`${category.label}, ${tile.pointValue} points, ${statusText}`}
                          >
                            {body}
                          </div>
                        );
                      }

                      return (
                        <button
                          key={tile.id}
                          type="button"
                          data-testid="movie-buff-tile"
                          data-category={category.label}
                          data-points={String(tile.pointValue)}
                          data-tile-id={tile.id}
                          aria-label={`Select ${category.label} for ${tile.pointValue} points`}
                          title={`Select ${category.label} for ${tile.pointValue} points`}
                          onClick={() => void handleSelectTile(tile)}
                          disabled={selectingTileId !== null}
                          className={`${tileClassName} movie-buff-board-tile--interactive`}
                        >
                          {body}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </section>

          <aside className="movie-buff-side-panel movie-buff-leaderboard-panel">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-amber-300">
                  Movie Buff
                </p>
                <h2 className="mt-2 text-xl font-black text-white">
                  Leaderboard
                </h2>
              </div>
              <span className="text-2xl text-amber-300" aria-hidden="true">
                ♛
              </span>
            </div>

            <div className="mt-5 space-y-3">
              {leaderboardPlayers.map((player, index) => (
                <div
                  key={player.id}
                  className={`movie-buff-leaderboard-row ${
                    index === 0 ? "movie-buff-leaderboard-row--top" : ""
                  }`}
                >
                  <span className="movie-buff-leaderboard-row__rank">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-white">
                      {player.name}
                    </p>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                      {player.tier}
                    </p>
                  </div>
                  <span className="text-lg font-black text-amber-100">
                    {player.score.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>

            <div className="movie-buff-now-playing mt-6">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-300">
                Now playing
              </p>
              <p className="mt-2 text-sm font-black text-white">
                Round {phaseView?.roundNumber ?? "—"} · {phaseView ? "Pick a tile" : "Board preview"}
              </p>
              <p className="mt-2 text-xs leading-5 text-zinc-400">
                The selected clip opens in the synchronized theater round.
              </p>
            </div>
          </aside>
        </div>

        <div className="movie-buff-balcony-rail" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <footer className="movie-buff-board-footer">
          <p>BALCONY VIEW · PICK A TILE TO START THE CLIP</p>
          <span>{preview.supportLine}</span>
        </footer>
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
