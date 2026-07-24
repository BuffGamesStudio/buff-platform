export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white">
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-black/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="text-2xl font-black tracking-wide text-red-600">
            BUFF GAMES
          </div>

          <div className="hidden items-center gap-8 text-sm text-gray-300 md:flex">
            <a href="#home" className="transition hover:text-white">
              Home
            </a>
            <a href="#games" className="transition hover:text-white">
              Games
            </a>
            <a href="#leaderboards" className="transition hover:text-white">
              Leaderboards
            </a>
            <a href="#about" className="transition hover:text-white">
              About
            </a>
          </div>

          <button className="rounded-full border border-red-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-red-600">
            Sign In
          </button>
        </div>
      </nav>

      <section
        id="home"
        className="relative overflow-hidden border-b border-white/10"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(220,38,38,0.25),_transparent_45%)]" />

        <div className="relative mx-auto flex min-h-[78vh] max-w-7xl flex-col items-center justify-center px-6 py-20 text-center">
          <p className="mb-4 text-sm font-bold uppercase tracking-[0.35em] text-yellow-500">
            Live interactive entertainment
          </p>

          <h1 className="max-w-5xl text-5xl font-black leading-tight sm:text-6xl md:text-8xl">
            PLAY WHAT YOU{" "}
            <span className="text-red-600">LOVE</span>
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-gray-300 md:text-xl">
            The next generation of live movie and TV trivia. Compete with
            friends, climb the leaderboards, and prove how much you really know.
          </p>

          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <button className="rounded-xl bg-red-600 px-8 py-4 text-lg font-bold transition hover:-translate-y-1 hover:bg-red-700">
              Play Movie Buff
            </button>

            <button className="rounded-xl border border-yellow-500 px-8 py-4 text-lg font-bold text-yellow-500 transition hover:-translate-y-1 hover:bg-yellow-500 hover:text-black">
              Join Beta
            </button>
          </div>
        </div>
      </section>

      <section id="games" className="mx-auto max-w-7xl px-6 py-20">
        <div className="mb-12 text-center">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-red-500">
            Featured games
          </p>
          <h2 className="mt-3 text-4xl font-black md:text-5xl">
            Choose Your Challenge
          </h2>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          <article className="group rounded-3xl border border-red-500/30 bg-gradient-to-br from-red-950/70 to-zinc-950 p-8 transition hover:-translate-y-2 hover:border-red-500">
            <div className="text-5xl">🎬</div>
            <h3 className="mt-6 text-3xl font-black">Movie Buff</h3>
            <p className="mt-4 leading-7 text-gray-300">
              Live movie trivia competitions where players identify films,
              compete for points, and climb the rankings.
            </p>
            <button className="mt-8 rounded-lg bg-red-600 px-6 py-3 font-bold transition hover:bg-red-700">
              Play Movie Buff
            </button>
          </article>

          <article className="group rounded-3xl border border-yellow-500/30 bg-gradient-to-br from-yellow-950/40 to-zinc-950 p-8 transition hover:-translate-y-2 hover:border-yellow-500">
            <div className="text-5xl">📺</div>
            <h3 className="mt-6 text-3xl font-black">Couch Potato</h3>
            <p className="mt-4 leading-7 text-gray-300">
              The television trivia experience for sitcom fans, drama experts,
              reality-show devotees, and streaming addicts.
            </p>
            <div className="mt-8 inline-flex rounded-lg border border-yellow-500 px-6 py-3 font-bold text-yellow-500">
              Coming Soon
            </div>
          </article>
        </div>
      </section>

      <section
        id="about"
        className="border-y border-white/10 bg-zinc-950"
      >
        <div className="mx-auto grid max-w-7xl gap-12 px-6 py-20 md:grid-cols-2 md:items-center">
          <div className="flex min-h-80 items-center justify-center rounded-3xl border border-white/10 bg-black">
            <div className="text-center">
              <div className="text-7xl">🎟️</div>
              <p className="mt-4 font-bold text-yellow-500">BUFFSTER™</p>
            </div>
          </div>

          <div>
            <p className="text-sm font-bold uppercase tracking-[0.3em] text-yellow-500">
              Official host
            </p>

            <h2 className="mt-3 text-4xl font-black md:text-5xl">
              Meet Buffster™
            </h2>

            <p className="mt-6 text-lg leading-8 text-gray-300">
              Buffster is the official mascot and host of Buff Games. He
              welcomes players, hosts competitions, celebrates winners, and
              makes every game feel like opening night at the movies.
            </p>
          </div>
        </div>
      </section>

      <section id="leaderboards" className="mx-auto max-w-7xl px-6 py-20">
        <div className="rounded-3xl border border-white/10 bg-gradient-to-r from-zinc-950 to-red-950/50 p-10 text-center">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-red-500">
            Competition starts here
          </p>

          <h2 className="mt-4 text-4xl font-black md:text-5xl">
            Think You’re a Real Buff?
          </h2>

          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-gray-300">
            Join live games, earn points, unlock achievements, and compete for
            your place on the Buff Games leaderboard.
          </p>

          <button className="mt-8 rounded-xl bg-red-600 px-8 py-4 text-lg font-bold transition hover:bg-red-700">
            Join the Competition
          </button>
        </div>
      </section>

      <footer className="border-t border-white/10 bg-black">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-8 text-sm text-gray-500 md:flex-row md:items-center md:justify-between">
          <p>© 2026 Buff Games. All rights reserved.</p>

          <div className="flex gap-6">
            <a href="#" className="transition hover:text-white">
              Privacy
            </a>
            <a href="#" className="transition hover:text-white">
              Terms
            </a>
            <a href="#" className="transition hover:text-white">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}