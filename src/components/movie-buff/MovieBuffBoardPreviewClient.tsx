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

function getPlayerInitials(name: string) {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return initials || "MB";
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
            ? "Board opening"
            : `Board opens in ${boardPhaseCountdown}s`,
      };
    }

    if (phaseView.phase === "vip_lock") {
      return {
        tone: "amber" as const,
        message: "Board opening",
      };
    }

    if (phaseView.phase === "board_select") {
      if (phaseView.callerIsSelector) {
        return {
          tone: "amber" as const,
          message:
            boardPhaseCountdown === null
              ? "Your turn · choose a tile"
              : `Your turn · ${boardPhaseCountdown}s`,
        };
      }

      return {
        tone: "amber" as const,
        message: selectorName
          ? `${selectorName}'s turn`
          : "Waiting for turn",
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
        <div className="movie-buff-theater-top-banner" />
        <div className="movie-buff-theater-arch movie-buff-theater-arch--left" />
        <div className="movie-buff-theater-arch movie-buff-theater-arch--right" />
        <div className="movie-buff-theater-film-reel movie-buff-theater-film-reel--left" />
        <div className="movie-buff-theater-film-reel movie-buff-theater-film-reel--right" />
        <div className="movie-buff-theater-screen-glow" />
      </div>

      <section className="movie-buff-theater-shell mx-auto max-w-[1800px]">
        <header className="movie-buff-board-marquee">
          <div
            className="movie-buff-board-marquee__searchlight movie-buff-board-marquee__searchlight--left"
            aria-hidden="true"
          />
          <div
            className="movie-buff-board-marquee__searchlight movie-buff-board-marquee__searchlight--right"
            aria-hidden="true"
          />
          <div className="movie-buff-title-marquee" aria-label="Movie Buff">
            <h1 className="movie-buff-title-marquee__word">
              <span className="movie-buff-title-marquee__line">Movie</span>
              <span className="movie-buff-title-marquee__line">Buff</span>
            </h1>
            <p
              className="movie-buff-title-marquee__tagline"
              aria-label="Lights, Camera, Guess"
            >
              <span className="movie-buff-title-marquee__tagline-word movie-buff-title-marquee__tagline-word--lights">
                Lights
              </span>
              <span
                className="movie-buff-title-marquee__tagline-separator"
                aria-hidden="true"
              >
                ·
              </span>
              <span className="movie-buff-title-marquee__tagline-word movie-buff-title-marquee__tagline-word--camera">
                Camera
              </span>
              <span
                className="movie-buff-title-marquee__tagline-separator"
                aria-hidden="true"
              >
                ·
              </span>
              <span className="movie-buff-title-marquee__tagline-word movie-buff-title-marquee__tagline-word--guess">
                Guess
              </span>
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
                  {player.isCurrentSelector ? (
                    <>
                      <span
                        className="movie-buff-player-ticket-edge movie-buff-player-ticket-edge--top"
                        aria-hidden="true"
                      />
                      <span
                        className="movie-buff-player-ticket-edge movie-buff-player-ticket-edge--bottom"
                        aria-hidden="true"
                      />
                    </>
                  ) : null}
                  <div className="movie-buff-player-card__header">
                    <div className="movie-buff-player-card__identity">
                      <div
                        className="movie-buff-player-avatar"
                        role="img"
                        aria-label={`${player.name} avatar`}
                        data-avatar-index={index}
                        style={
                          player.avatarUrl
                            ? {
                                backgroundImage: `url("${player.avatarUrl}")`,
                              }
                            : undefined
                        }
                      >
                        {!player.avatarUrl ? (
                          <span>{getPlayerInitials(player.name)}</span>
                        ) : null}
                      </div>
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
                    </div>
                    {player.isCurrentSelector ? (
                      <span className="sr-only">
                        {player.name}&apos;s turn
                      </span>
                    ) : null}
                  </div>
                  <div
                    className="movie-buff-player-vips"
                    aria-label={`${player.vips?.length ?? 0} VIPs`}
                  >
                    <div className="movie-buff-player-vips__heading">
                      <span>VIPs</span>
                      <span className="movie-buff-player-vips__count">
                        {player.vips?.length ?? 0}
                      </span>
                    </div>
                    <div className="movie-buff-player-vips__list">
                      {player.vips?.slice(0, 2).map((vip) => (
                        <span
                          key={vip.id}
                          className="movie-buff-player-vip"
                          title={vip.name}
                        >
                          <span
                            className="movie-buff-player-vip__icon"
                            aria-hidden="true"
                          >
                            {getPlayerInitials(vip.name)}
                          </span>
                          <span className="movie-buff-player-vip__name">
                            {vip.name}
                          </span>
                        </span>
                      ))}
                      {(player.vips?.length ?? 0) > 2 ? (
                        <span className="movie-buff-player-vip movie-buff-player-vip--more">
                          +{(player.vips?.length ?? 0) - 2} more
                        </span>
                      ) : null}
                      {(player.vips?.length ?? 0) === 0 ? (
                        <span className="movie-buff-player-vips__empty">
                          None selected
                        </span>
                      ) : null}
                    </div>
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

          </aside>

          <section
            className="movie-buff-board-stage"
            aria-label="Movie category board"
          >
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
                    <h2 className="text-base font-black uppercase tracking-[0.08em] text-amber-100">
                      {category.label === "Science Fiction"
                        ? "Sci-Fi"
                        : category.label}
                    </h2>
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

        </div>

      </section>
    </main>
  );
}
