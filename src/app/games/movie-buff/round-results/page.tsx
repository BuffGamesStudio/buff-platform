"use client";

import { useEffect, useState } from "react";

import MovieBuffAuthoritativeResultsClient from "@/components/movie-buff/MovieBuffAuthoritativeResultsClient";

export default function RoundResultsPage() {
  const [roomId, setRoomId] = useState<string | null>(null);

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    setRoomId(parameters.get("roomId")?.trim() ?? "");
  }, []);

  if (roomId === null) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
        <p className="text-2xl font-black">Synchronizing round results...</p>
      </main>
    );
  }

  if (!roomId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
        <div
          role="alert"
          className="max-w-xl rounded-3xl border border-red-500/30 bg-red-500/10 p-8 text-center"
        >
          <h1 className="text-3xl font-black">Room identity is required.</h1>
          <p className="mt-3 text-zinc-300">
            Return to your active Movie Buff room. No browser control can infer or advance a shared match without its room identity.
          </p>
        </div>
      </main>
    );
  }

  return <MovieBuffAuthoritativeResultsClient roomId={roomId} />;
}
