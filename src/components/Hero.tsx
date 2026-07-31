"use client";

import Link from "next/link";
import {
  ArrowRight,
  LogIn,
  UserPlus,
} from "lucide-react";

export default function Hero() {
  return (
    <section
      id="home"
      className="relative overflow-hidden bg-gradient-to-b from-black via-zinc-950 to-black"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(220,38,38,0.18),transparent_60%)]" />

      <div className="relative z-10 mx-auto flex min-h-[90vh] max-w-7xl flex-col items-center justify-center px-8 py-24 text-center">
        <span className="mb-6 rounded-full border border-red-600/40 bg-red-600/10 px-5 py-2 text-sm font-bold uppercase tracking-[0.35em] text-red-400">
          Welcome to Buff Games
        </span>

        <h1 className="max-w-5xl text-6xl font-black leading-tight text-white md:text-7xl xl:text-8xl">
          PLAY WHAT
          <span className="block text-red-500">
            YOU LOVE
          </span>
        </h1>

        <p className="mt-8 max-w-3xl text-xl leading-8 text-zinc-300">
          The home of live movie trivia, TV show competitions, tournaments,
          leaderboards, prizes, and the next generation of social gaming.
        </p>

        <div className="mt-12 flex flex-col gap-5 sm:flex-row">
          <Link
            href="/sign-up"
            className="flex items-center justify-center gap-3 rounded-xl bg-red-600 px-8 py-4 text-lg font-bold text-white transition hover:bg-red-700"
          >
            <UserPlus size={22} />
            Sign Up
          </Link>

          <Link
            href="/sign-in"
            className="flex items-center justify-center gap-3 rounded-xl border border-zinc-700 px-8 py-4 text-lg font-bold text-white transition hover:border-red-500 hover:text-red-400"
          >
            <LogIn size={20} />
            Sign In
          </Link>

          <Link
            href="/account"
            className="flex items-center justify-center gap-3 rounded-xl border border-zinc-700 px-8 py-4 text-lg font-bold text-white transition hover:border-red-500 hover:text-red-400"
          >
            Enter Buff Games
            <ArrowRight size={20} />
          </Link>
        </div>

        <div className="mt-20 grid w-full max-w-5xl gap-6 md:grid-cols-3">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 backdrop-blur">
            <h2 className="text-4xl font-black text-red-500">
              25K+
            </h2>

            <p className="mt-2 text-zinc-400">
              Players Expected at Launch
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 backdrop-blur">
            <h2 className="text-4xl font-black text-red-500">
              1000+
            </h2>

            <p className="mt-2 text-zinc-400">
              Movie &amp; TV Challenges
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 backdrop-blur">
            <h2 className="text-4xl font-black text-red-500">
              24/7
            </h2>

            <p className="mt-2 text-zinc-400">
              Competitive Multiplayer
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
