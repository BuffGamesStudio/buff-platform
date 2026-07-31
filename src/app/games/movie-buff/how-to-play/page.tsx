import Link from "next/link";

import { getMovieBuffDifficultyLabel } from "@/lib/game/movieBuffPresentation";
import {
  getMovieBuffPlayerTierDescription,
  type MovieBuffPlayerTier,
} from "@/lib/game/movieBuffPlayerTier";

export default function MovieBuffHowToPlayPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-8 md:p-10">
          <p className="text-sm font-black uppercase tracking-[0.3em] text-red-500">
            Movie Buff Guide
          </p>

          <h1 className="mt-4 text-4xl font-black md:text-5xl">
            How to play
          </h1>

          <p className="mt-4 max-w-3xl text-lg text-zinc-300">
            Join a room, watch or listen carefully, and name the movie before
            anyone else does. The game is built around one playback, fast
            answers, and smart use of the hint.
          </p>

          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href="/games/movie-buff/lobby"
              className="rounded-xl bg-red-600 px-6 py-3 font-black transition hover:bg-red-700"
            >
              Go to Lobby
            </Link>

            <Link
              href="/games/movie-buff"
              className="rounded-xl border border-zinc-700 px-6 py-3 font-black text-zinc-200 transition hover:border-red-500 hover:text-white"
            >
              Back to Movie Buff
            </Link>
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <InstructionCard
            title="1. Join or host a room"
            body="Start a public match for a quick game, or create a private room and share the code with friends."
          />

          <InstructionCard
            title="2. Each round starts before the clip"
            body="When the round opens, the movie clip is still locked. The countdown does not start until somebody presses play."
          />

          <InstructionCard
            title="3. You get one playback"
            body="Each movie clip plays once. Watch closely, because you do not get repeated plays of the same round."
          />

          <InstructionCard
            title="4. Hints stay personal"
            body="Hints are for your screen only. Other players do not see your clue, so you can decide whether to solve early or wait for the clip."
          />

          <InstructionCard
            title="5. Difficulty changes the clue"
            body={`${getMovieBuffDifficultyLabel("easy")} gives the clearest clue. ${getMovieBuffDifficultyLabel("medium")} and ${getMovieBuffDifficultyLabel("hard")} tighten the hint and make the round harder to solve early.`}
          />

          <InstructionCard
            title="6. Scoring rewards speed"
            body="Correct answers earn base points, fast answers earn more, and streaks keep building your score."
          />
        </div>

        <div className="mt-8 rounded-3xl border border-zinc-800 bg-zinc-950 p-8">
          <h2 className="text-2xl font-black text-red-400">
            Player tier ladder
          </h2>

          <p className="mt-3 max-w-3xl text-zinc-300">
            Your score also reflects your Movie Buff player tier as the match
            builds.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {([
              {
                tier: "Fan",
                range: "0-999 points",
              },
              {
                tier: "Buff",
                range: "1,000-2,499 points",
              },
              {
                tier: "Buffster",
                range: "2,500+ points",
              },
            ] as Array<{
              tier: MovieBuffPlayerTier;
              range: string;
            }>).map((entry) => (
              <div
                key={entry.tier}
                className="rounded-2xl border border-zinc-800 bg-black p-6"
              >
                <p className="text-sm font-black uppercase tracking-[0.2em] text-red-500">
                  {entry.tier}
                </p>
                <p className="mt-2 text-lg font-black text-white">
                  {entry.range}
                </p>
                <p className="mt-3 text-zinc-400">
                  {entry.tier} -{" "}
                  {getMovieBuffPlayerTierDescription(entry.tier)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function InstructionCard({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-7">
      <h2 className="text-2xl font-black text-red-400">{title}</h2>
      <p className="mt-3 text-zinc-300">{body}</p>
    </div>
  );
}
