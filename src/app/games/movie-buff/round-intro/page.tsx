"use client";

import Link from "next/link";
import { ArrowRight, Film, Flame, Play, Trophy } from "lucide-react";

export default function RoundIntroPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black px-6 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(220,38,38,0.22),_transparent_55%)]" />

      <div className="absolute left-0 top-0 h-full w-1/3 bg-gradient-to-r from-red-950/60 to-transparent" />
      <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-red-950/60 to-transparent" />

      <section className="relative z-10 w-full max-w-5xl text-center">
        <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-full border border-red-500/50 bg-red-600/20 shadow-2xl shadow-red-600/30">
          <Film size={38} className="text-red-500" />
        </div>

        <p className="text-sm font-black uppercase tracking-[0.5em] text-red-500">
          Movie Buff Presents
        </p>

        <h1 className="mt-5 text-7xl font-black uppercase tracking-tight md:text-9xl">
          Round 2
        </h1>

        <div className="mx-auto mt-6 h-1 w-32 rounded-full bg-red-600" />

        <h2 className="mt-8 text-3xl font-black text-zinc-200 md:text-5xl">
          Action Movies
        </h2>

        <p className="mx-auto mt-5 max-w-2xl text-lg text-zinc-400">
          Watch the clip. Identify the movie. Beat the clock.
        </p>

        <div className="mx-auto mt-10 grid max-w-3xl gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-5">
            <Play className="mx-auto text-red-500" />
            <p className="mt-3 text-sm text-zinc-500">Clip Length</p>
            <p className="text-xl font-black">8 Seconds</p>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-5">
            <Flame className="mx-auto text-orange-500" />
            <p className="mt-3 text-sm text-zinc-500">Current Streak</p>
            <p className="text-xl font-black">4 Correct</p>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-5">
            <Trophy className="mx-auto text-yellow-400" />
            <p className="mt-3 text-sm text-zinc-500">Points Available</p>
            <p className="text-xl font-black">1,000</p>
          </div>
        </div>

        <div className="mt-10 rounded-3xl border border-red-700/50 bg-gradient-to-br from-red-950/50 via-zinc-950 to-black p-6">
          <p className="text-sm font-black uppercase tracking-[0.3em] text-red-400">
            Buffster Says
          </p>

          <p className="mt-3 text-2xl font-black">
            This one separates the casual fans from the legends!
          </p>
        </div>

        <Link
          href="/games/movie-buff/play"
          className="mx-auto mt-10 flex w-full max-w-sm items-center justify-center gap-3 rounded-xl bg-red-600 px-8 py-5 text-xl font-black transition hover:bg-red-700"
        >
          Start Round
          <ArrowRight size={24} />
        </Link>
      </section>
    </main>
  );
}
