"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Bot } from "lucide-react";

import { getCurrentUser, signInAsGuest } from "@/lib/auth/auth";
import { joinRoom } from "@/lib/db/movieBuff";

export default function MovieBuffJoinPage() {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function joinFromCode() {
      const code = new URLSearchParams(
        window.location.search
      )
        .get("code")
        ?.trim()
        .toUpperCase() ?? "";

      if (!code) {
        if (!cancelled) {
          setError("This join link is missing a room code.");
        }
        return;
      }

      try {
        let user = await getCurrentUser();

        if (!user) {
          user = await signInAsGuest();
        }

        const room = await joinRoom(code, user.id);

        if (cancelled) {
          return;
        }

        router.replace(
          `/games/movie-buff/waiting-room?roomId=${encodeURIComponent(
            room.id
          )}&code=${encodeURIComponent(room.room_code)}`
        );
      } catch (joinError) {
        if (cancelled) {
          return;
        }

        setError(
          joinError instanceof Error
            ? joinError.message
            : "Unable to join this room."
        );
      }
    }

    void joinFromCode();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center px-6 text-center">
        <div className="mb-8 rounded-3xl border border-red-700/50 bg-gradient-to-br from-red-950/40 via-zinc-950 to-black p-8">
          <div className="mb-5 flex items-center justify-center gap-4">
            <div className="rounded-2xl bg-red-600 p-4">
              <Bot size={34} />
            </div>

            <div className="text-left">
              <p className="text-sm font-bold uppercase tracking-[0.25em] text-red-400">
                Movie Buff
              </p>

              <h1 className="text-3xl font-black">
                Joining room...
              </h1>
            </div>
          </div>

          <p className="max-w-2xl text-lg leading-8 text-zinc-300">
            We are signing you in and joining the room with
            the shared code.
          </p>
        </div>

        {error ? (
          <div className="mb-6 w-full max-w-2xl rounded-2xl border border-red-800 bg-red-950/60 px-5 py-4 text-sm font-semibold text-red-100">
            {error}
          </div>
        ) : null}

        <Link
          href="/games/movie-buff/lobby"
          className="flex items-center gap-2 font-bold text-zinc-300 transition hover:text-red-500"
        >
          <ArrowLeft size={20} />
          Back to Lobby
        </Link>
      </section>
    </main>
  );
}
