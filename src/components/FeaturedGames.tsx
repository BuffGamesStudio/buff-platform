"use client";

import { Clapperboard, Tv, Trophy, Users, Star } from "lucide-react";

export default function FeaturedGames() {
  return (
    <section className="bg-black py-24">
      <div className="mx-auto max-w-7xl px-8">

        <div className="mb-16 text-center">
          <h2 className="text-5xl font-black text-white">
            Choose Your Game
          </h2>

          <p className="mx-auto mt-6 max-w-2xl text-xl text-zinc-400">
            Challenge players around the world in games built for movie lovers
            and television fanatics.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">

          <div className="group rounded-3xl border border-red-700 bg-gradient-to-br from-zinc-900 to-black p-10 transition duration-300 hover:-translate-y-2 hover:border-red-500 hover:shadow-2xl hover:shadow-red-900/30">

            <div className="mb-8 flex items-center gap-5">

              <div className="rounded-2xl bg-red-600 p-4">
                <Clapperboard size={44} className="text-white" />
              </div>

              <div>
                <h3 className="text-4xl font-black text-white">
                  Movie Buff
                </h3>

                <p className="text-zinc-400">
                  Live Movie Trivia
                </p>
              </div>

            </div>

            <p className="mb-8 text-lg leading-8 text-zinc-300">
              Watch short clips, recognize legendary films, answer before your
              opponents, climb the rankings, and compete for prizes.
            </p>

            <div className="mb-10 space-y-4 text-zinc-300">

              <div className="flex items-center gap-3">
                <Users className="text-red-500" size={20} />
                Live Multiplayer
              </div>

              <div className="flex items-center gap-3">
                <Trophy className="text-red-500" size={20} />
                Daily Tournaments
              </div>

              <div className="flex items-center gap-3">
                <Star className="text-red-500" size={20} />
                Global Rankings
              </div>

            </div>

            <button className="rounded-xl bg-red-600 px-8 py-4 text-lg font-bold text-white transition hover:bg-red-700">
              Play Movie Buff
            </button>

          </div>

          <div className="group rounded-3xl border border-blue-700 bg-gradient-to-br from-zinc-900 to-black p-10 transition duration-300 hover:-translate-y-2 hover:border-blue-500 hover:shadow-2xl hover:shadow-blue-900/30">

            <div className="mb-8 flex items-center gap-5">

              <div className="rounded-2xl bg-blue-600 p-4">
                <Tv size={44} className="text-white" />
              </div>

              <div>
                <h3 className="text-4xl font-black text-white">
                  Couch Potato
                </h3>

                <p className="text-zinc-400">
                  TV Show Trivia
                </p>
              </div>

            </div>

            <p className="mb-8 text-lg leading-8 text-zinc-300">
              Test your television knowledge across sitcoms, reality shows,
              streaming originals, cartoons, dramas, and classics.
            </p>

            <div className="mb-10 space-y-4 text-zinc-300">

              <div className="flex items-center gap-3">
                <Users className="text-blue-400" size={20} />
                Multiplayer Matches
              </div>

              <div className="flex items-center gap-3">
                <Trophy className="text-blue-400" size={20} />
                Weekly Challenges
              </div>

              <div className="flex items-center gap-3">
                <Star className="text-blue-400" size={20} />
                Coming Soon
              </div>

            </div>

            <button className="rounded-xl border border-blue-500 px-8 py-4 text-lg font-bold text-blue-400 transition hover:bg-blue-500 hover:text-white">
              Coming Soon
            </button>

          </div>

        </div>

      </div>
    </section>
  );
}