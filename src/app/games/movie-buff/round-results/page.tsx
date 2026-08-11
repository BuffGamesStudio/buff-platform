"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Bot,
  CheckCircle2,
  Clock3,
  Crown,
  Film,
  Flame,
  Star,
  Trophy,
  XCircle,
} from "lucide-react";

import { leaveCurrentRoom } from "@/lib/db/movieBuff";
import { touchMovieBuffRoomPresence } from "@/lib/db/movieBuff";
import {
  getCurrentUserId,
  subscribeToGameState,
  unsubscribeFromGameState,
} from "@/lib/game/gameState";
import {
  buildMovieBuffPhaseRouteHref,
  getMovieBuffMatchPhaseView,
} from "@/lib/game/movieBuffPhaseService";
import {
  getMovieBuffRoundResults,
  type MovieBuffRoundResults,
} from "@/lib/game/roundService";
import { getMovieBuffPlayerTier } from "@/lib/game/movieBuffPlayerTier";

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

export default function RoundResultsPage() {
  const router = useRouter();
  const originalRoundNumber =
    useRef<number | null>(null);
  const isMountedRef =
    useRef(false);

  const [roomId, setRoomId] =
    useState("");
  const [results, setResults] =
    useState<MovieBuffRoundResults | null>(
      null,
    );
  const [loading, setLoading] =
    useState(true);
  const [leaving, setLeaving] =
    useState(false);
  const [error, setError] =
    useState("");
  const [nextPhaseCountdown, setNextPhaseCountdown] =
    useState<number | null>(null);
  const [, setNowTick] = useState(() =>
    Date.now(),
  );

  const navigateTo = useCallback(
    (destination: string, replace = false) => {
      if (!isMountedRef.current) {
        return;
      }

      if (replace) {
        router.replace(destination);
        return;
      }

      router.push(destination);
    },
    [router],
  );

  const syncPhase = useCallback(
    async (
      resolvedRoomId: string,
      fallbackRoundId: string,
    ) => {
      if (!isMountedRef.current) {
        return {
          redirected: false,
          nextPhaseCountdown: null,
        };
      }

      const phaseView =
        await getMovieBuffMatchPhaseView(
          resolvedRoomId,
        );

      if (!isMountedRef.current) {
        return {
          redirected: false,
          nextPhaseCountdown: null,
        };
      }

      const destination =
        buildMovieBuffPhaseRouteHref(
          phaseView,
          resolvedRoomId,
        );

      if (
        destination &&
        !destination.includes(
          "/games/movie-buff/round-results?",
        )
      ) {
        navigateTo(destination, true);
        return {
          redirected: true,
          nextPhaseCountdown: null,
        };
      }

      const phaseRoundId =
        phaseView.roundId ??
        fallbackRoundId;

      if (
        destination &&
        destination.includes(
          "/games/movie-buff/round-results?",
        ) &&
        !destination.includes(
          encodeURIComponent(phaseRoundId),
        )
      ) {
        navigateTo(
          `/games/movie-buff/round-results?roomId=${encodeURIComponent(
            resolvedRoomId,
          )}&roundId=${encodeURIComponent(
            phaseRoundId,
          )}`,
          true,
        );
        return {
          redirected: true,
          nextPhaseCountdown: null,
        };
      }

      return {
        redirected: false,
        nextPhaseCountdown:
          getCountdownSeconds(
            phaseView.resultsEndAt,
          ),
      };
    },
    [navigateTo],
  );

  const loadResults = useCallback(
    async (
      resolvedRoomId: string,
      resolvedRoundId: string,
    ) => {
      if (!isMountedRef.current) {
        return;
      }

      try {
        const nextResults =
          await getMovieBuffRoundResults(
            resolvedRoomId,
            resolvedRoundId,
          );

        if (!isMountedRef.current) {
          return;
        }

        if (
          originalRoundNumber.current ===
          null
        ) {
          originalRoundNumber.current =
            nextResults.roundNumber;
        }

        if (
          nextResults.roomStatus ===
          "finished"
        ) {
          navigateTo(
            `/games/movie-buff/final-results?roomId=${encodeURIComponent(
              resolvedRoomId,
            )}`,
            true,
          );
          return;
        }

        const phaseSync =
          await syncPhase(
            resolvedRoomId,
            nextResults.roundId,
          ).catch(() => null);

        if (
          !isMountedRef.current ||
          phaseSync?.redirected
        ) {
          return;
        }

        setNextPhaseCountdown(
          phaseSync?.nextPhaseCountdown ??
            null,
        );
        setResults(nextResults);
        setError("");
      } catch (loadError) {
        if (!isMountedRef.current) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load round results.",
        );
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    },
    [navigateTo, syncPhase],
  );

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    let refreshInterval:
      | number
      | undefined;
    let countdownInterval:
      | number
      | undefined;
    let channel:
      | ReturnType<
          typeof subscribeToGameState
        >
      | undefined;

    async function initialize() {
      try {
        await getCurrentUserId();

        const parameters =
          new URLSearchParams(
            window.location.search,
          );
        const resolvedRoomId =
          parameters.get("roomId") ?? "";
        const resolvedRoundId =
          parameters.get("roundId") ?? "";

        if (!active || !isMountedRef.current) {
          return;
        }

        if (
          !resolvedRoomId ||
          !resolvedRoundId
        ) {
          navigateTo(
            "/games/movie-buff/lobby",
            true,
          );
          return;
        }

        setRoomId(resolvedRoomId);
        try {
          await touchMovieBuffRoomPresence(
            resolvedRoomId,
          );
        } catch {}

        await loadResults(
          resolvedRoomId,
          resolvedRoundId,
        );

        if (
          !active ||
          !isMountedRef.current
        ) {
          return;
        }

        refreshInterval =
          window.setInterval(() => {
            void loadResults(
              resolvedRoomId,
              resolvedRoundId,
            );
          }, 2000);

        countdownInterval =
          window.setInterval(() => {
            if (active) {
              setNowTick(Date.now());
            }
          }, 1000);

        channel =
          subscribeToGameState(
            resolvedRoomId,
            () => {
              void loadResults(
                resolvedRoomId,
                resolvedRoundId,
              );
            },
          );
      } catch (initializeError) {
        if (!active || !isMountedRef.current) {
          return;
        }

        if (
          initializeError instanceof Error &&
          initializeError.message ===
            "You must sign in with a Buff Games account to continue."
        ) {
          navigateTo(
            `/sign-in?next=${encodeURIComponent(
              `/games/movie-buff/round-results${window.location.search}`,
            )}`,
            true,
          );
          return;
        }

        setError(
          initializeError instanceof Error
            ? initializeError.message
            : "Unable to initialize results.",
        );
        setLoading(false);
      }
    }

    void initialize();

    return () => {
      active = false;

      if (refreshInterval) {
        window.clearInterval(
          refreshInterval,
        );
      }

      if (countdownInterval) {
        window.clearInterval(
          countdownInterval,
        );
      }

      if (channel) {
        void unsubscribeFromGameState(
          channel,
        );
      }
    };
  }, [loadResults, navigateTo]);

  useEffect(() => {
    if (!roomId) {
      return;
    }

    const presenceTimer = window.setInterval(
      () => {
        void touchMovieBuffRoomPresence(
          roomId,
        ).catch(() => {});
      },
      2000,
    );

    return () => {
      window.clearInterval(
        presenceTimer,
      );
    };
  }, [roomId]);

  async function handleLeaveMatch() {
    if (leaving) {
      return;
    }

    const resolvedRoomId =
      roomId ||
      new URLSearchParams(
        window.location.search,
      ).get("roomId") ||
      "";

    if (!resolvedRoomId) {
      navigateTo("/games/movie-buff/lobby");
      return;
    }

    setLeaving(true);
    setError("");

    try {
      await leaveCurrentRoom(
        resolvedRoomId,
      );
      navigateTo("/games/movie-buff/lobby");
    } catch (leaveError) {
      setError(
        leaveError instanceof Error
          ? leaveError.message
          : "Unable to leave the match.",
      );
    } finally {
      setLeaving(false);
    }
  }

  if (loading || !results) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <p className="text-2xl font-black">
          Loading round results...
        </p>
      </main>
    );
  }

  const pointBreakdown = [
    {
      icon: (
        <Star className="text-yellow-400" />
      ),
      label: "Correct Answer",
      value: `+${results.basePoints}`,
    },
    {
      icon: (
        <Clock3 className="text-blue-400" />
      ),
      label: "Speed Bonus",
      value: `+${results.speedBonus}`,
    },
    ...(results.hintBonus > 0
      ? [
          {
            icon: (
              <Star className="text-cyan-400" />
            ),
            label: "Hint Bonus",
            value: `+${results.hintBonus}`,
          },
        ]
      : []),
    {
      icon: (
        <Flame className="text-orange-500" />
      ),
      label: "Streak Bonus",
      value: `+${results.streakBonus}`,
    },
    {
      icon: (
        <Trophy className="text-red-500" />
      ),
      label: "Round Total",
      value: `+${results.totalPoints}`,
    },
  ];

  const progressLabel = `${results.playersFinished} of ${results.playersTotal} players finished`;

  return (
    <main className="min-h-screen bg-black text-white">
      <header className="border-b border-zinc-800 bg-zinc-950/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-red-500">
              Round Complete
            </p>

            <h1 className="text-2xl font-black">
              Movie Buff
            </h1>
          </div>

          <div className="text-right">
            <p className="text-sm text-zinc-500">
              Round
            </p>

            <p className="text-xl font-black">
              {results.roundNumber} of{" "}
              {results.totalRounds}
            </p>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-10">
        {error ? (
          <div className="mb-6 rounded-2xl border border-red-700 bg-red-950/40 p-4 font-bold text-red-300">
            {error}
          </div>
        ) : null}

        <div
          className={`mb-8 rounded-3xl border p-8 ${
            results.isCorrect
              ? "border-green-700/50 bg-gradient-to-br from-green-950/30 via-zinc-950 to-black"
              : "border-red-700/50 bg-gradient-to-br from-red-950/30 via-zinc-950 to-black"
          }`}
        >
          <div className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
            <div className="flex items-start gap-4">
              <div
                className={`rounded-2xl p-4 ${
                  results.isCorrect
                    ? "bg-green-600"
                    : "bg-red-600"
                }`}
              >
                {results.isCorrect ? (
                  <CheckCircle2
                    size={36}
                  />
                ) : (
                  <XCircle size={36} />
                )}
              </div>

              <div>
                <p
                  className={`text-sm font-bold uppercase tracking-[0.25em] ${
                    results.isCorrect
                      ? "text-green-400"
                      : "text-red-400"
                  }`}
                >
                  {results.isCorrect
                    ? "Correct Answer"
                    : "Correct Movie"}
                </p>

                <h2 className="mt-2 text-4xl font-black">
                  {results.movieTitle}
                </h2>

                <p className="mt-3 text-lg text-zinc-300">
                  Your answer:{" "}
                  <strong>
                    {results.submittedAnswer ??
                      "No answer submitted"}
                  </strong>
                </p>

                {results.hintBonus > 0 ? (
                  <p className="mt-4 text-sm font-black uppercase tracking-[0.2em] text-cyan-300">
                    Solved from the hint before playback: +{results.hintBonus}
                  </p>
                ) : null}
              </div>
            </div>

            <div
              className={`rounded-2xl border px-8 py-5 text-center ${
                results.isCorrect
                  ? "border-green-700 bg-green-500/10"
                  : "border-red-700 bg-red-500/10"
              }`}
            >
              <p className="text-sm uppercase tracking-[0.2em] text-zinc-400">
                Round Points
              </p>

              <p className="mt-2 text-5xl font-black">
                +
                {results.totalPoints.toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        <div
          className={`mb-8 grid gap-4 ${
            pointBreakdown.length === 5
              ? "md:grid-cols-5"
              : "md:grid-cols-4"
          }`}
        >
          {pointBreakdown.map((item) => (
            <ResultStat
              key={item.label}
              icon={item.icon}
              label={item.label}
              value={item.value}
            />
          ))}
        </div>

        <div className="grid gap-8 xl:grid-cols-[1fr_360px]">
          <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-8">
            <div className="mb-7 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.25em] text-red-500">
                  Updated Standings
                </p>

                <h2 className="mt-2 text-3xl font-black">
                  Live Leaderboard
                </h2>
              </div>

              <Crown
                className="text-yellow-400"
                size={34}
              />
            </div>

            <div className="space-y-4">
              {results.standings.map(
                (player, index) => (
                  <div
                    key={
                      player.playerId
                    }
                    className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-black p-5"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-900 text-lg font-black text-red-500">
                        {index + 1}
                      </div>

                      <div>
                        <h3 className="font-black">
                          {
                            player.displayName
                          }
                        </h3>

                        <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">
                          {getMovieBuffPlayerTier(
                            player.score,
                          )}
                        </p>

                        <p
                          className={`text-sm ${
                            player.isCorrect
                              ? "text-green-400"
                              : "text-zinc-500"
                          }`}
                        >
                          Round: +
                          {player.roundPoints.toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <p className="text-xl font-black">
                      {player.score.toLocaleString()}
                    </p>
                  </div>
                ),
              )}
            </div>
          </div>

          <aside className="space-y-6">
            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-7">
              <div className="mb-5 flex items-center gap-3">
                <Film className="text-red-500" />

                <h2 className="text-xl font-black">
                  Movie Details
                </h2>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-sm text-zinc-500">
                    Title
                  </p>

                  <p className="font-black">
                    {results.movieTitle}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-zinc-500">
                    Release Year
                  </p>

                  <p className="font-black">
                    {results.releaseYear ??
                      "Unknown"}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-zinc-500">
                    Director
                  </p>

                  <p className="font-black">
                    {results.director ??
                      "Unknown"}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-red-700/50 bg-gradient-to-br from-red-950/40 via-zinc-950 to-black p-7">
              <div className="flex items-start gap-4">
                <div className="rounded-xl bg-red-600 p-3">
                  <Bot size={28} />
                </div>

                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.2em] text-red-400">
                    Buff Says
                  </p>

                  <p className="mt-2 font-black">
                    {results.isCorrect
                      ? "Great answer. Keep the streak alive!"
                      : "Shake it off and get ready for the next movie."}
                  </p>
                </div>
              </div>
            </div>

            {results.roundComplete ? (
              <div className="w-full rounded-xl border border-yellow-700 bg-yellow-500/10 px-8 py-5 text-center">
                <p className="text-sm font-black uppercase tracking-[0.2em] text-yellow-300">
                  Next Phase
                </p>

                <p className="mt-2 text-2xl font-black text-white">
                  {nextPhaseCountdown === null
                    ? "Opening automatically"
                    : `Opening in ${nextPhaseCountdown}s`}
                </p>

                <p className="mt-2 text-sm font-bold text-zinc-400">
                  The rehearsal phase engine advances to the next route
                  automatically.
                </p>
              </div>
            ) : (
              <div className="w-full rounded-xl border border-yellow-700 bg-yellow-500/10 px-8 py-5 text-center">
                <p className="text-sm font-black uppercase tracking-[0.2em] text-yellow-300">
                  Round Still Live
                </p>

                <p className="mt-2 text-2xl font-black text-white">
                  {progressLabel}
                </p>

                <p className="mt-2 text-sm font-bold text-zinc-400">
                  The next phase unlocks when everyone answers or times out.
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={handleLeaveMatch}
              disabled={leaving}
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-zinc-700 px-8 py-4 font-black text-zinc-400 transition hover:border-red-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <XCircle size={20} />
              {leaving
                ? "Leaving..."
                : "Leave Match"}
            </button>
          </aside>
        </div>
      </section>
    </main>
  );
}

function ResultStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
      <div className="flex items-center gap-3">
        {icon}

        <div>
          <p className="text-sm text-zinc-500">
            {label}
          </p>

          <p className="text-xl font-black">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}
