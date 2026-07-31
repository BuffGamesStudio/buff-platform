"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ArrowLeft,
  Crown,
  Film,
  Home,
  Medal,
  RotateCcw,
  Share2,
  Sparkles,
  Star,
  Trophy,
} from "lucide-react";

import {
  getMovieBuffFinalResults,
  type MovieBuffFinalResults,
  type MovieBuffFinalStanding,
} from "@/lib/game/roundService";
import { getMovieBuffPlayerTier } from "@/lib/game/movieBuffPlayerTier";

function rankStyle(rank: number) {
  if (rank === 1) {
    return "border-yellow-500/60 bg-yellow-500/10";
  }

  if (rank === 2) {
    return "border-zinc-400/60 bg-zinc-300/5";
  }

  if (rank === 3) {
    return "border-orange-700/60 bg-orange-900/10";
  }

  return "border-zinc-800 bg-black";
}

function rankIcon(rank: number) {
  if (rank === 1) {
    return (
      <Crown
        size={26}
        className="text-yellow-400"
      />
    );
  }

  if (rank === 2) {
    return (
      <Medal
        size={26}
        className="text-zinc-300"
      />
    );
  }

  if (rank === 3) {
    return (
      <Medal
        size={26}
        className="text-orange-500"
      />
    );
  }

  return (
    <span className="text-lg font-black text-zinc-500">
      {rank}
    </span>
  );
}

function placementLabel(position: number) {
  if (position === 1) {
    return "1st";
  }

  if (position === 2) {
    return "2nd";
  }

  if (position === 3) {
    return "3rd";
  }

  return `${position}th`;
}

function placementSummary(
  position: number,
  isTied = false
) {
  const label = placementLabel(position);

  return isTied ? `T-${label}` : label;
}

function placementPhrase(
  position: number,
  isTied = false
) {
  const label = placementLabel(position);

  return isTied
    ? `tied for ${label}`
    : label;
}

function finalStandingTieKey(
  standing: MovieBuffFinalStanding
) {
  return [
    standing.score,
    standing.correctAnswers,
    standing.accuracy,
  ].join(":");
}

function buildStandingPlacements(
  standings: MovieBuffFinalStanding[]
) {
  const groupSizes = new Map<string, number>();

  standings.forEach((standing) => {
    const key = finalStandingTieKey(standing);

    groupSizes.set(
      key,
      (groupSizes.get(key) ?? 0) + 1
    );
  });

  const placements = new Map<
    string,
    {
      rank: number;
      isTied: boolean;
    }
  >();

  let previousKey = "";
  let previousRank = 0;

  standings.forEach((standing, index) => {
    const key = finalStandingTieKey(standing);

    const rank =
      key === previousKey
        ? previousRank
        : index + 1;

    placements.set(standing.playerId, {
      rank,
      isTied:
        (groupSizes.get(key) ?? 0) > 1,
    });

    previousKey = key;
    previousRank = rank;
  });

  return placements;
}

export default function FinalResultsPage() {
  const router = useRouter();

  const [results, setResults] =
    useState<MovieBuffFinalResults | null>(
      null
    );

  const [loading, setLoading] =
    useState(true);
  const [sharing, setSharing] =
    useState(false);
  const [message, setMessage] =
    useState("");
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

  useEffect(() => {
    let active = true;

    async function initialize() {
      try {
        const parameters =
          new URLSearchParams(
            window.location.search
          );

        const resolvedRoomId =
          parameters.get("roomId") ?? "";

        if (!resolvedRoomId) {
          navigateTo(
            "/games/movie-buff/lobby",
            true
          );
          return;
        }

        const finalResults =
          await getMovieBuffFinalResults(
            resolvedRoomId
          );

        if (!active) {
          return;
        }

        setResults(finalResults);
      } catch (initializeError) {
        setError(
          initializeError instanceof Error
            ? initializeError.message
            : "Unable to load final results."
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void initialize();

    return () => {
      active = false;
    };
  }, [navigateTo]);

  const currentPlayer = useMemo(() => {
    if (!results) {
      return null;
    }

    return (
      results.standings.find(
        (player) =>
          player.playerId ===
          results.playerId
      ) ?? null
    );
  }, [results]);

  const standingPlacements = useMemo(
    () =>
      results
        ? buildStandingPlacements(
            results.standings
          )
        : new Map(),
    [results]
  );

  const currentPosition = useMemo(() => {
    if (!results) {
      return null;
    }

    return (
      standingPlacements.get(
        results.playerId
      ) ?? null
    );
  }, [results, standingPlacements]);

  const champion =
    results?.standings[0] ?? null;

  const topPosition = useMemo(() => {
    if (!champion) {
      return null;
    }

    return (
      standingPlacements.get(
        champion.playerId
      ) ?? null
    );
  }, [champion, standingPlacements]);

  const isTieAtTop =
    topPosition?.isTied === true &&
    topPosition.rank === 1;

  const currentPlayerTiedForFirst =
    currentPosition?.isTied === true &&
    currentPosition.rank === 1;

  const winnerIsCurrentPlayer =
    currentPosition?.rank === 1 &&
    currentPosition.isTied === false;

  const currentPlacementText =
    currentPosition
      ? placementPhrase(
          currentPosition.rank,
          currentPosition.isTied
        )
      : null;

  const currentPlacementSummary =
    currentPosition
      ? placementSummary(
          currentPosition.rank,
          currentPosition.isTied
        )
      : null;

  const championResultText = isTieAtTop
    ? currentPlayerTiedForFirst
      ? `You tied for 1st with ${currentPlayer?.score.toLocaleString()} points.`
      : `The match ended in a tie for 1st. You finished ${currentPlacementText}.`
    : winnerIsCurrentPlayer
    ? `You are the Movie Buff champion with ${currentPlayer?.score.toLocaleString()} points.`
    : `${champion?.displayName} won the match. You finished ${currentPlacementText}.`;

  const buffsterResultText = isTieAtTop
    ? currentPlayerTiedForFirst
      ? `You tied for 1st with ${currentPlayer?.correctAnswers} correct answers and ${currentPlayer?.score.toLocaleString()} points.`
      : `You finished ${currentPlacementText} with ${currentPlayer?.correctAnswers} correct answers and ${currentPlayer?.score.toLocaleString()} points.`
    : winnerIsCurrentPlayer
    ? `You finished first with ${currentPlayer?.correctAnswers} correct answers.`
    : `You finished ${currentPlacementText} with ${currentPlayer?.correctAnswers} correct answers and ${currentPlayer?.score.toLocaleString()} points.`;

  const sharePlacementText =
    currentPosition
      ? placementPhrase(
          currentPosition.rank,
          currentPosition.isTied
        )
      : null;

  async function handleShare() {
    if (
      !results ||
      !currentPlayer ||
      !sharePlacementText ||
      sharing
    ) {
      return;
    }

    setSharing(true);
    setMessage("");

    const shareText =
      `I finished ${sharePlacementText} in Movie Buff with ` +
      `${currentPlayer.score.toLocaleString()} points ` +
      `and ${currentPlayer.correctAnswers} correct answers.`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: "Movie Buff Results",
          text: shareText,
        });

        setMessage("Results shared.");
      } else {
        await navigator.clipboard.writeText(
          shareText
        );

        setMessage(
          "Results copied to your clipboard."
        );
      }
    } catch (shareError) {
      if (
        shareError instanceof Error &&
        shareError.name === "AbortError"
      ) {
        setMessage("");
      } else {
        setMessage(
          "Unable to share results."
        );
      }
    } finally {
      setSharing(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <p className="text-2xl font-black">
          Loading final results...
        </p>
      </main>
    );
  }

  if (
    error ||
    !results ||
    !currentPlayer ||
    !champion ||
    !currentPosition ||
    !currentPlacementSummary ||
    !currentPlacementText ||
    !topPosition
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
        <div className="max-w-xl rounded-3xl border border-red-700 bg-red-950/30 p-8 text-center">
          <h1 className="text-3xl font-black">
            Final Results Unavailable
          </h1>

          <p className="mt-4 text-red-300">
            {error ||
              "The final match data could not be loaded."}
          </p>

          <button
            type="button"
            onClick={() =>
              navigateTo(
                "/games/movie-buff/lobby"
              )
            }
            className="mt-7 inline-flex rounded-xl bg-red-600 px-7 py-4 font-black transition hover:bg-red-700"
          >
            Return to Lobby
          </button>
        </div>
      </main>
    );
  }
  return (
    <main className="min-h-screen bg-black text-white">
      <header className="border-b border-zinc-800 bg-zinc-950/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-red-500">
              Match Complete
            </p>

            <h1 className="text-2xl font-black">
              Movie Buff
            </h1>
          </div>

          <button
            type="button"
            onClick={() =>
              navigateTo(
                "/games/movie-buff/lobby"
              )
            }
            className="flex items-center gap-2 text-sm font-bold text-zinc-400 transition hover:text-white"
          >
            <ArrowLeft size={18} />
            Back to Lobby
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8 overflow-hidden rounded-3xl border border-red-700/50 bg-gradient-to-br from-red-950/40 via-zinc-950 to-black p-8 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-red-600 shadow-2xl shadow-red-600/30">
            <Trophy size={42} />
          </div>

          <p className="mt-6 text-sm font-bold uppercase tracking-[0.3em] text-red-400">
            Final Results
          </p>

          <h2 className="mt-3 text-5xl font-black md:text-7xl">
            {currentPlayerTiedForFirst
              ? "It's a Tie!"
              : winnerIsCurrentPlayer
              ? "You Won!"
              : "Great Game!"}
          </h2>

          <p className="mx-auto mt-4 max-w-2xl text-lg text-zinc-300">
            {championResultText}
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <SummaryCard
              label="Final Position"
              value={currentPlacementSummary}
              emphasized
            />

            <SummaryCard
              label="Final Score"
              value={currentPlayer.score.toLocaleString()}
            />

            <SummaryCard
              label="Correct Answers"
              value={`${currentPlayer.correctAnswers} of ${results.totalRounds}`}
            />
          </div>
        </div>

        <div className="mb-8 grid gap-4 md:grid-cols-4">
          <StatCard
            icon={
              <Star className="text-yellow-400" />
            }
            label="Accuracy"
            value={`${currentPlayer.accuracy}%`}
          />

          <StatCard
            icon={
              <Sparkles className="text-purple-400" />
            }
            label="Current Streak"
            value={`${currentPlayer.currentStreak} correct`}
          />

          <StatCard
            icon={
              <Film className="text-blue-400" />
            }
            label="Rounds Played"
            value={`${results.completedRounds} of ${results.totalRounds}`}
          />

          <StatCard
            icon={
              <Trophy className="text-red-500" />
            }
            label="Match Score"
            value={currentPlayer.score.toLocaleString()}
          />
        </div>

        <div className="grid gap-8 xl:grid-cols-[1fr_360px]">
          <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-8">
            <div className="mb-7 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.25em] text-red-500">
                  Final Standings
                </p>

                <h2 className="mt-2 text-3xl font-black">
                  Match Leaderboard
                </h2>
              </div>

              <Crown
                className="text-yellow-400"
                size={34}
              />
            </div>

            <div className="space-y-4">
              {results.standings.map(
                (
                  player:
                    MovieBuffFinalStanding,
                  index
                ) => {
                  const rank = index + 1;
                  const placement =
                    standingPlacements.get(
                      player.playerId
                    ) ?? {
                      rank,
                      isTied: false,
                    };
                  const isCurrentPlayer =
                    player.playerId ===
                    results.playerId;

                  return (
                    <div
                      key={player.playerId}
                      className={`flex flex-col gap-4 rounded-2xl border p-5 sm:flex-row sm:items-center sm:justify-between ${rankStyle(
                        placement.rank
                      )} ${
                        isCurrentPlayer
                          ? "ring-2 ring-red-600"
                          : ""
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-950">
                          {rankIcon(
                            placement.rank
                          )}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-black">
                              {
                                player.displayName
                              }
                            </h3>

                            {isCurrentPlayer && (
                              <span className="rounded-full bg-red-600 px-2 py-1 text-xs font-black">
                                YOU
                              </span>
                            )}

                            {placement.isTied && (
                              <span className="rounded-full border border-zinc-700 px-2 py-1 text-xs font-black text-zinc-300">
                                TIE
                              </span>
                            )}
                          </div>

                          <p className="mt-1 text-sm text-zinc-500">
                            {getMovieBuffPlayerTier(
                              player.score
                            )}{" "}
                            ·{" "}
                            {
                              player.correctAnswers
                            }
                            /
                            {
                              results.totalRounds
                            }{" "}
                            correct ·{" "}
                            {player.accuracy}%
                            accuracy
                          </p>
                        </div>
                      </div>

                      <p className="text-2xl font-black">
                        {player.score.toLocaleString()}
                      </p>
                    </div>
                  );
                }
              )}
            </div>
          </section>

          <aside className="space-y-6">
            <div className="rounded-3xl border border-red-700/50 bg-gradient-to-br from-red-950/40 via-zinc-950 to-black p-7">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-red-400">
                Buff Says
              </p>

              <h3 className="mt-3 text-2xl font-black">
                {currentPlayerTiedForFirst
                  ? "Tie at the top!"
                  : winnerIsCurrentPlayer
                  ? "Champion performance!"
                  : "Strong performance!"}
              </h3>

              <p className="mt-3 text-zinc-300">
                {buffsterResultText}
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                navigateTo(
                  "/games/movie-buff/lobby"
                )
              }
              className="flex w-full items-center justify-center gap-3 rounded-xl bg-red-600 px-8 py-5 text-xl font-black transition hover:bg-red-700"
            >
              <RotateCcw size={24} />
              Play Again
            </button>

            <button
              type="button"
              onClick={handleShare}
              disabled={sharing}
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-zinc-700 px-8 py-4 font-black transition hover:border-red-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Share2 size={20} />

              {sharing
                ? "Sharing..."
                : "Share Results"}
            </button>

            {message && (
              <p className="text-center text-sm font-bold text-zinc-400">
                {message}
              </p>
            )}

            <button
              type="button"
              onClick={() =>
                navigateTo(
                  "/games/movie-buff/lobby"
                )
              }
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-zinc-700 px-8 py-4 font-black text-zinc-400 transition hover:border-red-500 hover:text-white"
            >
              <Home size={20} />
              Return to Lobby
            </button>
          </aside>
        </div>
      </section>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-black/70 px-7 py-5">
      <p className="text-sm text-zinc-500">
        {label}
      </p>

      <p
        className={`mt-1 text-3xl font-black ${
          emphasized
            ? "text-red-500"
            : "text-white"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function StatCard({
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
