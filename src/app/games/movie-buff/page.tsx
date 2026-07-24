import Link from "next/link";

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

        <p className="mb-12 max-w-3xl text-2xl text-zinc-300">
          Watch clips. Guess movies. Beat everyone.
        </p>

        <div className="mb-16 flex flex-wrap justify-center gap-6">

          <button className="rounded-xl bg-red-600 px-10 py-5 text-xl font-bold transition hover:bg-red-700">
            PLAY NOW
          </button>

          <button className="rounded-xl border border-zinc-700 px-10 py-5 text-xl font-bold transition hover:border-red-500">
            HOW TO PLAY
          </button>

        </div>

        <div className="grid w-full max-w-5xl gap-6 md:grid-cols-3">

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8">
            <h2 className="mb-3 text-3xl font-black text-red-500">
              Live Matches
            </h2>

            <p className="text-zinc-400">
              Play against movie fans around the world.
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8">
            <h2 className="mb-3 text-3xl font-black text-red-500">
              1000+
            </h2>

            <p className="text-zinc-400">
              Movie clips and growing.
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8">
            <h2 className="mb-3 text-3xl font-black text-red-500">
              Win Rewards
            </h2>

            <p className="text-zinc-400">
              XP, rankings, achievements and prizes.
            </p>
          </div>

        </div>

        <Link
          href="/"
          className="mt-16 text-zinc-500 hover:text-red-500"
        >
          ← Back to Buff Games
        </Link>

      </section>

    </main>
  );
}