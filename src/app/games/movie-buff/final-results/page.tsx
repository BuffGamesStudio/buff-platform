"use client";

import Link from "next/link";
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

const finalStandings = [
  {
    rank: 1,
    name: "CinemaKing",
    score: 12480,
    correct: 9,
    streak: 6,
  },
  {
    rank: 2,
    name: "ShaTheSolutionist",
    score: 11350,
    correct: 8,
    streak: 5,
  },
  {
    rank: 3,
    name: "MovieMaster24",
    score: 9875,
    correct: 7,
    streak: 4,
  },
  {
    rank: 4,
    name: "FilmFanatic",
    score: 7420,
    correct: 5,
    streak: 2,
  },
];

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
    return <Crown size={26} className="text-yellow-400" />;
  }

  if (rank === 2) {
    return <Medal size={26} className="text-zinc-300" />;
  }

  if (rank === 3) {
    return <Medal size={26} className="text-orange-500" />;
  }

  return <span className="text-lg font-black text-zinc-500">{rank}</span>;
}

export default function FinalResultsPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <header className="border-b border-zinc-800 bg-zinc-950/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-red-500">
              Match Complete
            </p>

            <h1 className="text-2xl font-black">Movie Buff</h1>
          </div>

          <Link
            href="/games/movie-buff/lobby"
            className="flex items-center gap-2 text-sm font-bold text-zinc-400 transition hover:text-white"
          >
            <ArrowLeft size={18} />
            Back to Lobby
          </Link>
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
            Great Game!
          </h2>

          <p className="mx-auto mt-4 max-w-2xl text-lg text-zinc-300">
            You finished second and proved that you know your movies.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <div className="rounded-2xl border border-zinc-800 bg-black/70 px-7 py-5">
              <p className="text-sm text-zinc-500">Final Position</p>
              <p className="mt-1 text-3xl font-black text-red-500">2nd</p>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-black/70 px-7 py-5">
              <p className="text-sm text-zinc-500">Final Score</p>
              <p className="mt-1 text-3xl font-black">11,350</p>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-black/70 px-7 py-5">
              <p className="text-sm text-zinc-500">Correct Answers</p>
              <p className="mt-1 text-3xl font-black">8 of 10</p>
            </div>
          </div>
        </div>

        <div className="mb-8 grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <div className="flex items-center gap-3">
              <Star className="text-yellow-400" />

              <div>
                <p className="text-sm text-zinc-500">Accuracy</p>
                <p className="text-xl font-black">80%</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <div className="flex items-center gap-3">
              <Sparkles className="text-purple-400" />

              <div>
                <p className="text-sm text-zinc-500">Best Streak</p>
                <p className="text-xl font-black">5 correct</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <div className="flex items-center gap-3">
              <Film className="text-blue-400" />

              <div>
                <p className="text-sm text-zinc-500">Best Category</p>
                <p className="text-xl font-black">Action</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <div className="flex items-center gap-3">
              <Trophy className="text-red-500" />

              <div>
                <p className="text-sm text-zinc-500">XP Earned</p>
                <p className="text-xl font-black">+1,250 XP</p>
              </div>
            </div>
          </div>
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

              <Crown className="text-yellow-400" size={34} />
            </div>

            <div className="space-y-4">
              {finalStandings.map((player) => (
                <div
                  key={player.rank}
                  className={`flex flex-col gap-4 rounded-2xl border p-5 sm:flex-row sm:items-center sm:justify-between ${rankStyle(
                    player.rank,
                  )} ${
                    player.name === "ShaTheSolutionist"
                      ? "ring-2 ring-red-600"
                      : ""
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-950">
                      {rankIcon(player.rank)}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-black">{player.name}</h3>

                        {player.name === "ShaTheSolutionist" && (
                          <span className="rounded-full bg-red-600 px-2 py-1 text-xs font-black">
                            YOU
                          </span>
                        )}
                      </div>

                      <p className="mt-1 text-sm text-zinc-500">
                        {player.correct}/10 correct · Best streak:{" "}
                        {player.streak}
                      </p>
                    </div>
                  </div>

                  <p className="text-2xl font-black">
                    {player.score.toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <aside className="space-y-6">
            <div className="rounded-3xl border border-red-700/50 bg-gradient-to-br from-red-950/40 via-zinc-950 to-black p-7">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-red-400">
                Buffster Says
              </p>

              <h3 className="mt-3 text-2xl font-black">
                Strong performance!
              </h3>

              <p className="mt-3 text-zinc-300">
                You were only 1,130 points away from first place. Keep that
                streak alive in the next match.
              </p>
            </div>

            <Link
              href="/games/movie-buff/waiting-room"
              className="flex w-full items-center justify-center gap-3 rounded-xl bg-red-600 px-8 py-5 text-xl font-black transition hover:bg-red-700"
            >
              <RotateCcw size={24} />
              Play Again
            </Link>

            <button
              type="button"
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-zinc-700 px-8 py-4 font-black transition hover:border-red-500"
            >
              <Share2 size={20} />
              Share Results
            </button>

            <Link
              href="/games/movie-buff/lobby"
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-zinc-700 px-8 py-4 font-black text-zinc-400 transition hover:border-red-500 hover:text-white"
            >
              <Home size={20} />
              Return to Lobby
            </Link>
          </aside>
        </div>
      </section>
    </main>
  );
}
