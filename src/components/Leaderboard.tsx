"use client";

import { Trophy, Medal, Crown, TrendingUp } from "lucide-react";

const players = [
  {
    rank: 1,
    name: "MovieMaster24",
    score: "18,420",
    icon: Crown,
    color: "text-yellow-400",
  },
  {
    rank: 2,
    name: "CinemaKing",
    score: "17,965",
    icon: Trophy,
    color: "text-zinc-300",
  },
  {
    rank: 3,
    name: "FilmFanatic",
    score: "17,481",
    icon: Medal,
    color: "text-orange-500",
  },
  {
    rank: 4,
    name: "SceneStealer",
    score: "16,920",
    icon: TrendingUp,
    color: "text-red-500",
  },
  {
    rank: 5,
    name: "TriviaTitan",
    score: "16,310",
    icon: TrendingUp,
    color: "text-red-500",
  },
];

export default function Leaderboard() {
  return (
    <section
      id="leaderboards"
      className="bg-black py-24"
    >
      <div className="mx-auto max-w-6xl px-8">

        <div className="mb-14 text-center">
          <h2 className="text-5xl font-black text-white">
            Global Leaderboard
          </h2>

          <p className="mt-5 text-xl text-zinc-400">
            Compete against movie lovers from around the world.
          </p>
        </div>

        <div className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950">

          {players.map((player) => {
            const Icon = player.icon;

            return (
              <div
                key={player.rank}
                className="flex items-center justify-between border-b border-zinc-800 px-8 py-6 last:border-none transition hover:bg-zinc-900"
              >
                <div className="flex items-center gap-6">

                  <div className="w-10 text-center text-2xl font-black text-red-500">
                    #{player.rank}
                  </div>

                  <Icon className={player.color} size={28} />

                  <div>
                    <h3 className="text-xl font-bold text-white">
                      {player.name}
                    </h3>

                    <p className="text-zinc-500">
                      Buff Games Player
                    </p>
                  </div>

                </div>

                <div className="text-right">

                  <div className="text-2xl font-black text-white">
                    {player.score}
                  </div>

                  <div className="text-sm text-zinc-500">
                    Points
                  </div>

                </div>

              </div>
            );
          })}

        </div>

      </div>
    </section>
  );
}
