"use client";

import Link from "next/link";
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

const standings = [
  {
    rank: 1,
    name: "CinemaKing",
    roundPoints: 780,
    totalScore: 3230,
  },
  {
    rank: 2,
    name: "ShaTheSolutionist",
    roundPoints: 650,
    totalScore: 2830,
  },
  {
    rank: 3,
    name: "MovieMaster24",
    roundPoints: 500,
    totalScore: 2475,
  },
  {
    rank: 4,
    name: "FilmFanatic",
    roundPoints: 0,
    totalScore: 1840,
  },
];

export default function RoundResultsPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <header className="border-b border-zinc-800 bg-zinc-950/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-red-500">
              Round Complete
            </p>

            <h1 className="text-2xl font-black">Movie Buff</h1>
          </div>

          <div className="text-right">
            <p className="text-sm text-zinc-500">Round</p>
            <p className="text-xl font-black">1 of 10</p>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8 rounded-3xl border border-green-700/50 bg-gradient-to-br from-green-950/30 via-zinc-950 to-black p-8">
          <div className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl bg-green-600 p-4">
                <CheckCircle2 size={36} />
              </div>

              <div>
                <p className="text-sm font-bold uppercase tracking-[0.25em] text-green-400">
                  Correct Answer
                </p>

                <h2 className="mt-2 text-4xl font-black">
                  The Dark Knight
                </h2>

                <p className="mt-3 text-lg text-zinc-300">
                  You identified the movie correctly.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-green-700 bg-green-500/10 px-8 py-5 text-center">
              <p className="text-sm uppercase tracking-[0.2em] text-green-400">
                Round Points
              </p>

              <p className="mt-2 text-5xl font-black text-green-400">
                +650
              </p>
            </div>
          </div>
        </div>

        <div className="mb-8 grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <div className="flex items-center gap-3">
              <Star className="text-yellow-400" />

              <div>
                <p className="text-sm text-zinc-500">Correct Answer</p>
                <p className="text-xl font-black">+500</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <div className="flex items-center gap-3">
              <Clock3 className="text-blue-400" />

              <div>
                <p className="text-sm text-zinc-500">Speed Bonus</p>
                <p className="text-xl font-black">+100</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <div className="flex items-center gap-3">
              <Flame className="text-orange-500" />

              <div>
                <p className="text-sm text-zinc-500">Streak Bonus</p>
                <p className="text-xl font-black">+50</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <div className="flex items-center gap-3">
              <Trophy className="text-red-500" />

              <div>
                <p className="text-sm text-zinc-500">Total Score</p>
                <p className="text-xl font-black">2,830</p>
              </div>
            </div>
          </div>
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

              <Crown className="text-yellow-400" size={34} />
            </div>

            <div className="space-y-4">
              {standings.map((player) => (
                <div
                  key={player.rank}
                  className={`flex items-center justify-between rounded-2xl border p-5 ${
                    player.name === "ShaTheSolutionist"
                      ? "border-red-600 bg-red-600/10"
                      : "border-zinc-800 bg-black"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-900 text-lg font-black text-red-500">
                      {player.rank}
                    </div>

                    <div>
                      <h3 className="font-black">{player.name}</h3>

                      <p className="text-sm text-zinc-500">
                        Round: +{player.roundPoints}
                      </p>
                    </div>
                  </div>

                  <p className="text-xl font-black">
                    {player.totalScore.toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <aside className="space-y-6">
            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-7">
              <div className="mb-5 flex items-center gap-3">
                <Film className="text-red-500" />
                <h2 className="text-xl font-black">Movie Details</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-sm text-zinc-500">Title</p>
                  <p className="font-black">The Dark Knight</p>
                </div>

                <div>
                  <p className="text-sm text-zinc-500">Release Year</p>
                  <p className="font-black">2008</p>
                </div>

                <div>
                  <p className="text-sm text-zinc-500">Genre</p>
                  <p className="font-black">Action · Crime · Drama</p>
                </div>

                <div>
                  <p className="text-sm text-zinc-500">Director</p>
                  <p className="font-black">Christopher Nolan</p>
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
                    Great answer. Your four-round streak is still alive.
                  </p>
                </div>
              </div>
            </div>

            <Link
              href="/games/movie-buff/final-results"
              className="flex w-full items-center justify-center gap-3 rounded-xl bg-red-600 px-8 py-5 text-xl font-black transition hover:bg-red-700"
            >
              View Final Results
              <ArrowRight size={24} />
            </Link>

            <Link
              href="/games/movie-buff/lobby"
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-zinc-700 px-8 py-4 font-black text-zinc-400 transition hover:border-red-500 hover:text-white"
            >
              <XCircle size={20} />
              Leave Match
            </Link>
          </aside>
        </div>
      </section>
    </main>
  );
}

