"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  Bot,
  Check,
  Clock3,
  Copy,
  Crown,
  Film,
  Gamepad2,
  Lock,
  LogOut,
  Users,
} from "lucide-react";

const players = [
  {
    name: "ShaTheSolutionist",
    status: "Host",
    ready: true,
    isHost: true,
  },
  {
    name: "CinemaKing",
    status: "Ready",
    ready: true,
    isHost: false,
  },
  {
    name: "MovieMaster24",
    status: "Ready",
    ready: true,
    isHost: false,
  },
  {
    name: "Waiting for player...",
    status: "Open Slot",
    ready: false,
    isHost: false,
  },
];

export default function WaitingRoomPage() {
  const [copied, setCopied] = useState(false);
  const [ready, setReady] = useState(false);

  const roomCode = "BUFF24";

  async function copyRoomCode() {
    await navigator.clipboard.writeText(roomCode);
    setCopied(true);

    setTimeout(() => {
      setCopied(false);
    }, 1500);
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <header className="border-b border-zinc-800 bg-zinc-950/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <Link
            href="/games/movie-buff/lobby"
            className="flex items-center gap-2 font-bold text-zinc-300 transition hover:text-red-500"
          >
            <ArrowLeft size={20} />
            Back to Lobby
          </Link>

          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-red-500">
              Private Match
            </p>

            <h1 className="text-2xl font-black">Waiting Room</h1>
          </div>

          <button
            type="button"
            className="flex items-center gap-2 font-bold text-zinc-400 transition hover:text-red-500"
          >
            <LogOut size={20} />
            <span className="hidden sm:inline">Leave</span>
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-8 grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="rounded-3xl border border-red-700/50 bg-gradient-to-br from-red-950/40 via-zinc-950 to-black p-8">
            <div className="mb-5 flex items-center gap-4">
              <div className="rounded-2xl bg-red-600 p-4">
                <Bot size={34} />
              </div>

              <div>
                <p className="text-sm font-bold uppercase tracking-[0.25em] text-red-400">
                  Buffster Says
                </p>

                <h2 className="text-3xl font-black">
                  Get Ready, Movie Buffs
                </h2>
              </div>
            </div>

            <p className="max-w-3xl text-lg leading-8 text-zinc-300">
              The match begins when every player is ready. You will have limited
              time to identify each movie, so answer quickly.
            </p>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-8">
            <div className="mb-4 flex items-center gap-3">
              <Lock className="text-red-500" />
              <h2 className="text-xl font-black">Room Code</h2>
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-black px-5 py-4">
              <span className="text-3xl font-black tracking-[0.25em]">
                {roomCode}
              </span>

              <button
                type="button"
                onClick={copyRoomCode}
                className="rounded-xl border border-zinc-700 p-3 transition hover:border-red-500 hover:text-red-500"
                aria-label="Copy room code"
              >
                {copied ? <Check size={22} /> : <Copy size={22} />}
              </button>
            </div>

            <p className="mt-4 text-sm text-zinc-500">
              Share this code with friends.
            </p>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
          <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-8">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.25em] text-red-500">
                  Players
                </p>

                <h2 className="mt-2 text-3xl font-black">3 of 4 Joined</h2>
              </div>

              <div className="rounded-2xl bg-red-600/15 p-4 text-red-500">
                <Users size={30} />
              </div>
            </div>

            <div className="space-y-4">
              {players.map((player, index) => (
                <div
                  key={`${player.name}-${index}`}
                  className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-black p-5"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-900 font-black text-red-500">
                      {player.name === "Waiting for player..."
                        ? "?"
                        : player.name.charAt(0)}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <h3
                          className={`font-black ${
                            player.name === "Waiting for player..."
                              ? "text-zinc-500"
                              : "text-white"
                          }`}
                        >
                          {player.name}
                        </h3>

                        {player.isHost && (
                          <Crown size={18} className="text-yellow-400" />
                        )}
                      </div>

                      <p className="text-sm text-zinc-500">{player.status}</p>
                    </div>
                  </div>

                  <div
                    className={`rounded-full px-4 py-2 text-sm font-bold ${
                      player.ready
                        ? "bg-green-500/15 text-green-400"
                        : "bg-zinc-800 text-zinc-500"
                    }`}
                  >
                    {player.ready ? "Ready" : "Waiting"}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-8">
              <p className="text-sm font-bold uppercase tracking-[0.25em] text-red-500">
                Match Settings
              </p>

              <div className="mt-6 space-y-5">
                <div className="flex items-center gap-4">
                  <Film className="text-red-500" />
                  <div>
                    <p className="text-sm text-zinc-500">Category</p>
                    <p className="font-black">Blockbusters</p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <Gamepad2 className="text-red-500" />
                  <div>
                    <p className="text-sm text-zinc-500">Difficulty</p>
                    <p className="font-black">Medium</p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <Clock3 className="text-red-500" />
                  <div>
                    <p className="text-sm text-zinc-500">Rounds</p>
                    <p className="font-black">10 Rounds</p>
                  </div>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setReady(!ready)}
              className={`flex w-full items-center justify-center gap-3 rounded-xl px-8 py-5 text-xl font-black transition ${
                ready
                  ? "bg-green-600 hover:bg-green-700"
                  : "bg-red-600 hover:bg-red-700"
              }`}
            >
              {ready ? <Check size={24} /> : <Gamepad2 size={24} />}
              {ready ? "Ready!" : "I'm Ready"}
            </button>

            <Link
  href="/games/movie-buff/round-intro"
  className={`block w-full rounded-xl border px-8 py-5 text-center text-xl font-black transition ${
    ready
      ? "border-red-500 text-white hover:bg-red-600"
      : "pointer-events-none border-zinc-700 text-zinc-500"
  }`}
>
  Start Match
</Link>
          </div>
        </div>
      </section>
    </main>
  );
}

