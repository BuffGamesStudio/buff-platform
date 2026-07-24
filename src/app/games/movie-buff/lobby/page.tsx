"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  Bot,
  Check,
  Copy,
  Gamepad2,
  Globe2,
  KeyRound,
  Lock,
  Search,
  Users,
} from "lucide-react";

const categories = [
  "Blockbusters",
  "Comedy",
  "Action",
  "Horror",
  "Animation",
  "Classics",
];

const difficulties = ["Easy", "Medium", "Hard"];

export default function MovieBuffLobbyPage() {
  const [category, setCategory] = useState("Blockbusters");
  const [difficulty, setDifficulty] = useState("Medium");
  const [roomCode, setRoomCode] = useState("");
  const [copied, setCopied] = useState(false);

  const privateCode = "BUFF24";

  async function copyCode() {
    await navigator.clipboard.writeText(privateCode);
    setCopied(true);

    setTimeout(() => {
      setCopied(false);
    }, 1500);
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <header className="border-b border-zinc-800 bg-zinc-950/90">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <Link
            href="/games/movie-buff"
            className="flex items-center gap-2 font-bold text-zinc-300 transition hover:text-red-500"
          >
            <ArrowLeft size={20} />
            Movie Buff
          </Link>

          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-red-500">
              Game Lobby
            </p>

            <h1 className="text-2xl font-black">
              Choose How You Want to Play
            </h1>
          </div>

          <div className="hidden w-28 sm:block" />
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-10 grid gap-6 lg:grid-cols-[1fr_360px]">
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
                  Welcome to the Movie Buff Lobby
                </h2>
              </div>
            </div>

            <p className="max-w-3xl text-lg leading-8 text-zinc-300">
              Pick a category, choose your difficulty, and enter a public or
              private match. Fast answers earn more points, so stay sharp.
            </p>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-8">
            <div className="mb-3 flex items-center gap-3">
              <Users className="text-red-500" />
              <h2 className="text-xl font-black">Players Online</h2>
            </div>

            <p className="text-5xl font-black text-white">1,248</p>
            <p className="mt-2 text-zinc-500">
              84 matches currently active
            </p>
          </div>
        </div>

        <div className="mb-10 grid gap-8 lg:grid-cols-2">
          <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-8">
            <div className="mb-7 flex items-center gap-4">
              <div className="rounded-2xl bg-red-600/15 p-4 text-red-500">
                <Globe2 size={32} />
              </div>

              <div>
                <h2 className="text-3xl font-black">Public Match</h2>
                <p className="text-zinc-400">
                  Find players and start quickly.
                </p>
              </div>
            </div>

            <button
              type="button"
              className="flex w-full items-center justify-center gap-3 rounded-xl bg-red-600 px-6 py-4 text-lg font-black transition hover:bg-red-700"
            >
              <Search size={22} />
              Find Match
            </button>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-8">
            <div className="mb-7 flex items-center gap-4">
              <div className="rounded-2xl bg-blue-600/15 p-4 text-blue-400">
                <Lock size={32} />
              </div>

              <div>
                <h2 className="text-3xl font-black">Private Match</h2>
                <p className="text-zinc-400">
                  Create a room or join friends.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                className="rounded-xl border border-blue-500 px-6 py-4 text-lg font-black text-blue-400 transition hover:bg-blue-500 hover:text-white"
              >
                Create Room
              </button>

              <div className="flex gap-2">
                <input
                  value={roomCode}
                  onChange={(event) => setRoomCode(event.target.value)}
                  placeholder="Room code"
                  className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-black px-4 py-4 uppercase outline-none transition focus:border-blue-500"
                />

                <button
                  type="button"
                  className="rounded-xl bg-blue-600 px-5 font-black transition hover:bg-blue-700"
                >
                  Join
                </button>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between rounded-xl border border-zinc-800 bg-black px-4 py-3">
              <div className="flex items-center gap-3">
                <KeyRound size={20} className="text-zinc-500" />

                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                    Example room code
                  </p>

                  <p className="font-black tracking-[0.25em]">
                    {privateCode}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={copyCode}
                className="rounded-lg border border-zinc-700 p-2 transition hover:border-red-500 hover:text-red-500"
                aria-label="Copy room code"
              >
                {copied ? <Check size={20} /> : <Copy size={20} />}
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-8">
            <h2 className="mb-6 text-3xl font-black">Choose Category</h2>

            <div className="grid gap-3 sm:grid-cols-2">
              {categories.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setCategory(item)}
                  className={`rounded-xl border px-5 py-4 text-left font-bold transition ${
                    category === item
                      ? "border-red-500 bg-red-600 text-white"
                      : "border-zinc-700 bg-black text-zinc-300 hover:border-red-500"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-8">
            <h2 className="mb-6 text-3xl font-black">Choose Difficulty</h2>

            <div className="space-y-3">
              {difficulties.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setDifficulty(item)}
                  className={`flex w-full items-center justify-between rounded-xl border px-5 py-4 font-bold transition ${
                    difficulty === item
                      ? "border-red-500 bg-red-600 text-white"
                      : "border-zinc-700 bg-black text-zinc-300 hover:border-red-500"
                  }`}
                >
                  <span>{item}</span>

                  {difficulty === item && <Check size={20} />}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-10 rounded-3xl border border-zinc-800 bg-zinc-950 p-8">
          <div className="flex flex-col items-center justify-between gap-6 lg:flex-row">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.25em] text-red-500">
                Your Match Setup
              </p>

              <h2 className="mt-2 text-3xl font-black">
                {category} · {difficulty}
              </h2>
            </div>

            <button
              type="button"
              className="flex w-full items-center justify-center gap-3 rounded-xl bg-red-600 px-10 py-5 text-xl font-black transition hover:bg-red-700 lg:w-auto"
            >
              <Gamepad2 size={24} />
              Start Match
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}