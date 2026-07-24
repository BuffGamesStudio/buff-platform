"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import {
  ArrowLeft,
  Bot,
  Clock3,
  Film,
  Flame,
  Heart,
  Play,
  Send,
  Star,
  Trophy,
} from "lucide-react";

const leaderboard = [
  { rank: 1, name: "CinemaKing", score: 2450 },
  { rank: 2, name: "ShaTheSolutionist", score: 2180 },
  { rank: 3, name: "MovieMaster24", score: 1975 },
  { rank: 4, name: "FilmFanatic", score: 1840 },
];

export default function MovieBuffPlayPage() {
  const [timeLeft, setTimeLeft] = useState(30);
  const [answer, setAnswer] = useState("");
  const [submittedAnswer, setSubmittedAnswer] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);

  const round = 1;
  const totalRounds = 10;
  const progress = (round / totalRounds) * 100;

  useEffect(() => {
    if (timeLeft <= 0 || isSubmitted) return;

    const timer = window.setInterval(() => {
      setTimeLeft((current) => Math.max(current - 1, 0));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [timeLeft, isSubmitted]);

  function submitAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanedAnswer = answer.trim();

    if (!cleanedAnswer || timeLeft === 0) return;

    setSubmittedAnswer(cleanedAnswer);
    setIsSubmitted(true);

    window.setTimeout(() => {
      window.location.href = "/games/movie-buff/round-results";
    }, 1200);
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <header className="border-b border-zinc-800 bg-zinc-950">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <Link
            href="/games/movie-buff/lobby"
            className="flex items-center gap-2 font-black text-zinc-300 hover:text-white"
          >
            <ArrowLeft size={20} />
            Leave Match
          </Link>

          <div className="text-center">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-red-500">
              Live Match
            </p>
            <h1 className="text-2xl font-black">Movie Buff</h1>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-zinc-800 px-4 py-3">
            <Star size={20} className="text-yellow-400" />
            <div>
              <p className="text-xs text-zinc-500">Score</p>
              <p className="font-black">2,180</p>
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-8">
        <div className="grid gap-4 md:grid-cols-4">
          <StatCard
            icon={<Film className="text-red-500" />}
            label="Round"
            value={`${round} of ${totalRounds}`}
          />

          <StatCard
            icon={<Clock3 className="text-red-500" />}
            label="Time Left"
            value={`${timeLeft} seconds`}
          />

          <StatCard
            icon={<Flame className="text-orange-500" />}
            label="Streak"
            value="3 correct"
          />

          <StatCard
            icon={<Heart className="text-red-500" />}
            label="Lives"
            value="3 remaining"
          />
        </div>

        <div className="mt-8 h-3 overflow-hidden rounded-full bg-zinc-900">
          <div
            className="h-full rounded-full bg-red-600 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="mt-8 grid gap-8 xl:grid-cols-[1fr_340px]">
          <div className="space-y-6">
            <div className="flex min-h-[360px] items-center justify-center rounded-3xl border border-zinc-800 bg-gradient-to-br from-zinc-950 to-black">
              <div className="text-center">
                <button
                  type="button"
                  className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-red-600 transition hover:scale-105 hover:bg-red-700"
                >
                  <Play size={42} fill="currentColor" />
                </button>

                <h2 className="mt-7 text-3xl font-black">
                  Movie Clip Placeholder
                </h2>

                <p className="mt-2 text-zinc-500">
                  The round video will play here.
                </p>
              </div>
            </div>

            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-7">
              <h2 className="text-2xl font-black">Name This Movie</h2>

              <p className="mt-2 text-zinc-500">
                Enter the complete movie title before time expires.
              </p>

              {isSubmitted ? (
                <div className="mt-6 rounded-2xl border border-green-700 bg-green-500/10 p-5">
                  <p className="text-sm font-black uppercase tracking-widest text-green-400">
                    Answer Locked
                  </p>
                  <p className="mt-2 text-xl font-black">
                    {submittedAnswer}
                  </p>
                </div>
              ) : (
                <form
                  onSubmit={submitAnswer}
                  className="mt-6 flex flex-col gap-4 sm:flex-row"
                >
                  <input
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                    disabled={timeLeft === 0}
                    placeholder="Enter the movie title"
                    className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-black px-5 py-4 text-lg outline-none transition placeholder:text-zinc-600 focus:border-red-500 disabled:opacity-50"
                  />

                  <button
                    type="submit"
                    disabled={!answer.trim() || timeLeft === 0}
                    className="flex items-center justify-center gap-3 rounded-xl bg-red-600 px-8 py-4 text-lg font-black transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
                  >
                    <Send size={22} />
                    Submit Answer
                  </button>
                </form>
              )}

              {timeLeft === 0 && !isSubmitted && (
                <p className="mt-4 font-bold text-red-500">
                  Time is up.
                </p>
              )}
            </div>

            <div className="rounded-3xl border border-red-700/50 bg-gradient-to-br from-red-950/40 via-zinc-950 to-black p-7">
              <div className="flex items-start gap-4">
                <div className="rounded-2xl bg-red-600 p-4">
                  <Bot size={32} />
                </div>

                <div>
                  <p className="text-sm font-black uppercase tracking-[0.25em] text-red-400">
                    Buffster Says
                  </p>
                  <p className="mt-2 text-xl font-black">
                    Aww yeah! Watch closely—this one moves fast!
                  </p>
                </div>
              </div>
            </div>
          </div>

          <aside className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-widest text-red-500">
                  Live
                </p>
                <h2 className="text-2xl font-black">Leaderboard</h2>
              </div>

              <Trophy className="text-yellow-400" />
            </div>

            <div className="mt-6 space-y-4">
              {leaderboard.map((player) => (
                <div
                  key={player.rank}
                  className={`flex items-center justify-between rounded-2xl border p-4 ${
                    player.name === "ShaTheSolutionist"
                      ? "border-red-600 bg-red-600/10"
                      : "border-zinc-800 bg-black"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-900 font-black text-red-500">
                      {player.rank}
                    </div>

                    <p className="font-black">{player.name}</p>
                  </div>

                  <p className="font-black">
                    {player.score.toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>
    </main>
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
      <div className="flex items-center gap-4">
        {icon}
        <div>
          <p className="text-sm text-zinc-500">{label}</p>
          <p className="text-xl font-black">{value}</p>
        </div>
      </div>
    </div>
  );
}
