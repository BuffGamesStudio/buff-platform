import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function MovieBuffPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <section className="mx-auto flex min-h-screen max-w-7xl flex-col items-center justify-center px-8 text-center">
        <span className="mb-6 rounded-full border border-red-600 bg-red-600/10 px-6 py-2 text-sm font-bold uppercase tracking-[0.3em] text-red-400">
          Buff Games Presents
        </span>

        <h1 className="mb-6 text-7xl font-black tracking-tight">
          MOVIE BUFF
        </h1>

        <p className="mb-4 max-w-3xl text-3xl font-black text-zinc-100 md:text-5xl">
          So you think you&apos;re a Movie Buff?
        </p>

        <p className="mb-12 max-w-3xl text-2xl font-bold uppercase tracking-[0.24em] text-red-400">
          Watch. Guess. Win.
        </p>

        <div className="mb-6 flex flex-wrap justify-center gap-6">
          <Link
            href="/games/movie-buff/lobby"
            className="rounded-xl bg-red-600 px-10 py-5 text-xl font-bold transition hover:bg-red-700"
          >
            PLAY MOVIE BUFF
          </Link>

          <Link
            href="/games/movie-buff/how-to-play"
            className="rounded-xl border border-zinc-700 px-10 py-5 text-xl font-bold transition hover:border-red-500"
          >
            HOW TO PLAY
          </Link>
        </div>

        <div className="mb-10 flex flex-wrap justify-center gap-4 text-sm font-bold">
          <Link
            href="/sign-in?next=%2Faccount"
            className="rounded-xl border border-zinc-700 px-6 py-3 text-zinc-200 transition hover:border-red-500 hover:text-white"
          >
            Sign In
          </Link>

          <Link
            href="/sign-up?next=%2Faccount"
            className="rounded-xl border border-zinc-700 px-6 py-3 text-zinc-200 transition hover:border-red-500 hover:text-white"
          >
            Sign Up
          </Link>
        </div>

        <Link
          href="/"
          className="inline-flex items-center gap-2 text-zinc-500 transition hover:text-red-500"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Buff Games
        </Link>
      </section>
    </main>
  );
}
