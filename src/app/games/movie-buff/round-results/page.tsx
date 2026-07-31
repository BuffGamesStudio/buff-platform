"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowRight,
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

import {
  getCurrentUserId,
  subscribeToGameState,
  unsubscribeFromGameState,
} from "@/lib/game/gameState";
import { leaveCurrentRoom } from "@/lib/db/movieBuff";

import {
  advanceMovieBuffRound,
  getCurrentMovieBuffRound,
  getMovieBuffRoundResults,
  type MovieBuffRoundResults,
} from "@/lib/game/roundService";
import { getMovieBuffPlayerTier } from "@/lib/game/movieBuffPlayerTier";

export default function RoundResultsPage() {
  const router = useRouter();
  const originalRoundNumber =
    useRef<number | null>(null);

  const [roomId, setRoomId] =
    useState("");
  const [roundId, setRoundId] =
    useState("");

  const [results, setResults] =
    useState<MovieBuffRoundResults | null>(
      null
    );

  const [loading, setLoading] =
    useState(true);
  const [advancing, setAdvancing] =
    useState(false);
  const [leaving, setLeaving] =
    useState(false);
  const [error, setError] =
    useState("");

  const navigateTo = useCallback(
    (destination: string, replace = false) => {
      if (typeof window !== "undefined") {
        if (replace) {
          window.location.replace(destination);
          return;
        }

        window.location.assign(destination);
        return;
      }

      if (replace) {
        router.replace(destination);
        return;
      }

      router.push(destination);
    },
    [router]
  );

  const loadResults = useCallback(
    async (
      resolvedRoomId: string,
      resolvedRoundId: string
    ) => {
      try {
        const nextResults =
          await getMovieBuffRoundResults(
            resolvedRoomId,
            resolvedRoundId
          );

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
              resolvedRoomId
            )}`,
            true
          );

          return;
        }

        try {
          const currentRound =
            await getCurrentMovieBuffRound(
              resolvedRoomId
            );

          if (
            currentRound.roundId !==
            resolvedRoundId
          ) {
            navigateTo(
              `/games/movie-buff/board-preview?roomId=${encodeURIComponent(
                resolvedRoomId
              )}`,
              true
            );

            return;
          }
        } catch {
          // Keep showing the current round results if the live round check fails.
        }

        setResults(nextResults);
        setError("");
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load round results."
        );
      } finally {
        setLoading(false);
      }
    },
    [navigateTo]
  );

  useEffect(() => {
    let active = true;
    let refreshInterval:
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
            window.location.search
          );

        const resolvedRoomId =
          parameters.get("roomId") ?? "";

        const resolvedRoundId =
          parameters.get("roundId") ?? "";

        if (
          !resolvedRoomId ||
          !resolvedRoundId
        ) {
          navigateTo(
            "/games/movie-buff/lobby",
            true
          );
          return;
        }

        setRoomId(resolvedRoomId);
        setRoundId(resolvedRoundId);

        await loadResults(
          resolvedRoomId,
          resolvedRoundId
        );

        if (!active) {
          return;
        }

        refreshInterval =
          window.setInterval(() => {
            void loadResults(
              resolvedRoomId,
              resolvedRoundId
            );
          }, 2000);

        channel =
          subscribeToGameState(
            resolvedRoomId,
            async () => {
              try {
                const refreshed =
                  await getMovieBuffRoundResults(
                    resolvedRoomId,
                    resolvedRoundId
                  );

                if (
                  refreshed.roomStatus ===
                  "finished"
                ) {
                  navigateTo(
                    `/games/movie-buff/final-results?roomId=${encodeURIComponent(
                      resolvedRoomId
                    )}`,
                    true
                  );

                  return;
                }

                if (
                  originalRoundNumber.current !==
                    null &&
                  refreshed.roundNumber ===
                    originalRoundNumber.current
                ) {
                  setResults(refreshed);
                }
              } catch {
                navigateTo(
                  `/games/movie-buff/board-preview?roomId=${encodeURIComponent(
                    resolvedRoomId
                  )}`,
                  true
                );
              }
            }
          );

      } catch (initializeError) {
        if (
          initializeError instanceof Error &&
          initializeError.message ===
            "You must sign in with a Buff Games account to continue."
        ) {
          navigateTo(
            `/sign-in?next=${encodeURIComponent(
              `/games/movie-buff/round-results${window.location.search}`
            )}`,
            true
          );
          return;
        }

        setError(
          initializeError instanceof Error
            ? initializeError.message
            : "Unable to initialize results."
        );

        setLoading(false);
      }
    }

    void initialize();

    return () => {
      active = false;

      if (refreshInterval) {
        window.clearInterval(
          refreshInterval
        );
      }

      if (channel) {
        void unsubscribeFromGameState(
          channel
        );
      }
    };
  }, [loadResults, navigateTo]);

  async function handleNextRound() {
    if (
      !roomId ||
      !roundId ||
      advancing
    ) {
      return;
    }

    setAdvancing(true);
    setError("");

    try {
      const resolveResponse = await fetch(
        "/api/movie-buff/board/resolve",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            roomId,
          }),
        }
      );

      if (!resolveResponse.ok) {
        const payload =
          (await resolveResponse.json().catch(
            () => null
          )) as {
            error?: string;
          } | null;

        throw new Error(
          payload?.error ??
            "Unable to resolve the selected board tile."
        );
      }

      const result =
        await advanceMovieBuffRound(
          roomId
        );

      if (
        result.status === "finished"
      ) {
        navigateTo(
          `/games/movie-buff/final-results?roomId=${encodeURIComponent(
            roomId
          )}`
        );

        return;
      }

      navigateTo(
        `/games/movie-buff/board-preview?roomId=${encodeURIComponent(
          roomId
        )}`
      );
    } catch (advanceError) {
      setError(
        advanceError instanceof Error
          ? advanceError.message
          : "Unable to advance the round."
      );
    } finally {
      setAdvancing(false);
    }
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
        {error && (
          <div className="mb-6 rounded-2xl border border-red-700 bg-red-950/40 p-4 font-bold text-red-300">
            {error}
          </div>
        )}

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

                {results.hintBonus > 0 && (
                  <p className="mt-4 text-sm font-black uppercase tracking-[0.2em] text-cyan-300">
                    Solved from the hint before playback: +{results.hintBonus}
                  </p>
                )}
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
                            player.score
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
                )
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
                    Buffster Says
                  </p>

                  <p className="mt-2 font-black">
                    {results.isCorrect
                      ? "Great answer. Keep the streak alive!"
                      : "Shake it off and get ready for the next movie."}
                  </p>
                </div>
              </div>
            </div>

            {results.isHost ? (
              results.roundComplete ? (
                <button
                  type="button"
                  onClick={
                    handleNextRound
                  }
                  disabled={advancing}
                  className="flex w-full items-center justify-center gap-3 rounded-xl bg-red-600 px-8 py-5 text-xl font-black transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {advancing
                    ? "Loading..."
                    : results.roundNumber >=
                        results.totalRounds
                      ? "View Final Results"
                      : "Next Round"}

                  <ArrowRight
                    size={24}
                  />
                </button>
              ) : (
                <div className="w-full rounded-xl border border-yellow-700 bg-yellow-500/10 px-8 py-5 text-center">
                  <p className="text-sm font-black uppercase tracking-[0.2em] text-yellow-300">
                    Round Still Live
                  </p>

                  <p className="mt-2 text-2xl font-black text-white">
                    {progressLabel}
                  </p>

                  <p className="mt-2 text-sm font-bold text-zinc-400">
                    The next round unlocks when everyone answers or times out.
                  </p>
                </div>
              )
            ) : results.roundComplete ? (
              <div className="w-full rounded-xl border border-zinc-700 px-8 py-5 text-center text-xl font-black text-zinc-500">
                Waiting for host...
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
                  Waiting for the rest of the room to finish this movie.
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
