"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, Film, Trophy, XCircle } from "lucide-react";

import {
  getMovieBuffAuthoritativePhase,
  type MovieBuffAuthoritativePhaseView,
} from "@/lib/game/movieBuffAuthoritativePhaseClient";
import {
  getMovieBuffRoundResults,
  type MovieBuffRoundResults,
} from "@/lib/game/roundService";

export default function MovieBuffAuthoritativeResultsClient({
  roomId,
}: {
  roomId: string;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<MovieBuffAuthoritativePhaseView | null>(null);
  const [results, setResults] = useState<MovieBuffRoundResults | null>(null);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [nowMs, setNowMs] = useState(Date.now());
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const nextPhase = await getMovieBuffAuthoritativePhase(roomId);
      setPhase(nextPhase);
      setServerOffsetMs(new Date(nextPhase.serverNow).getTime() - Date.now());

      if (nextPhase.roundId) {
        setResults(await getMovieBuffRoundResults(roomId, nextPhase.roundId));
      }
    } catch (loadError) {
      if (loadError instanceof Error && loadError.message === "SIGN_IN_REQUIRED") {
        router.replace(
          `/sign-in?next=${encodeURIComponent(`/games/movie-buff/round-results?roomId=${roomId}`)}`,
        );
        return;
      }
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to synchronize round results.",
      );
    }
  }, [roomId, router]);

  useEffect(() => {
    void load();
    const poll = window.setInterval(() => void load(), 750);
    const clock = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(clock);
    };
  }, [load]);

  const remainingSeconds = useMemo(() => {
    if (!phase?.resultsEndAt) return 0;
    return Math.max(
      0,
      Math.ceil(
        (new Date(phase.resultsEndAt).getTime() - (nowMs + serverOffsetMs)) /
          1000,
      ),
    );
  }, [nowMs, phase?.resultsEndAt, serverOffsetMs]);

  if (!phase || !results) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
        <div className="text-center">
          <Trophy className="mx-auto animate-pulse text-amber-300" size={50} />
          <p className="mt-4 text-2xl font-black">Synchronizing round results...</p>
          {error ? <p className="mt-4 text-red-300">{error}</p> : null}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(120,53,15,0.25),_transparent_32%),linear-gradient(180deg,#090909,#000)] px-5 py-8 text-white">
      <section className="mx-auto max-w-6xl">
        <header className="rounded-[2rem] border border-amber-500/25 bg-gradient-to-br from-amber-950/30 via-zinc-950 to-black p-8 text-center shadow-2xl">
          <Film className="mx-auto text-amber-300" size={44} />
          <p className="mt-4 text-xs font-black uppercase tracking-[0.35em] text-amber-300">
            Synchronized Results
          </p>
          <h1 className="mt-3 text-4xl font-black md:text-6xl">{results.movieTitle}</h1>
          <p className="mt-3 text-zinc-400">
            {[results.releaseYear, results.director].filter(Boolean).join(" · ")}
          </p>
          <div className="mx-auto mt-6 max-w-sm rounded-2xl border border-zinc-800 bg-black/70 p-5">
            <Clock3 className="mx-auto text-red-400" />
            <p className="mt-2 text-xs font-black uppercase tracking-[0.22em] text-zinc-500">
              Return to board
            </p>
            <p className="mt-2 text-6xl font-black tabular-nums">{remainingSeconds}</p>
            <p className="mt-2 text-sm text-zinc-400">
              The server rotates the selector and advances automatically.
            </p>
          </div>
        </header>

        {error ? (
          <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 font-bold text-red-200">
            {error}
          </div>
        ) : null}

        <div className="mt-6 grid gap-5 lg:grid-cols-[360px_1fr]">
          <section className={`rounded-3xl border p-6 ${results.isCorrect ? "border-emerald-500/30 bg-emerald-500/10" : "border-red-500/30 bg-red-500/10"}`}>
            {results.isCorrect ? (
              <CheckCircle2 className="text-emerald-300" size={38} />
            ) : (
              <XCircle className="text-red-300" size={38} />
            )}
            <p className="mt-4 text-xs font-black uppercase tracking-[0.22em] text-zinc-400">
              Your result
            </p>
            <p className="mt-2 text-3xl font-black">
              {results.isCorrect ? `+${results.totalPoints}` : "No points"}
            </p>
            <p className="mt-3 text-sm leading-6 text-zinc-300">
              {results.submittedAnswer
                ? `You answered “${results.submittedAnswer}”.`
                : "No answer was submitted before the shared deadline."}
            </p>
          </section>

          <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-300">
                  Scoreboard
                </p>
                <h2 className="mt-2 text-2xl font-black">Round {results.roundNumber}</h2>
              </div>
              <span className="rounded-full border border-zinc-700 px-3 py-1 text-xs font-black text-zinc-400">
                Phase v{phase.phaseVersion}
              </span>
            </div>

            <div className="mt-5 space-y-3">
              {results.standings.map((standing, index) => (
                <div
                  key={standing.playerId}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-800 bg-black px-5 py-4"
                >
                  <div className="flex items-center gap-4">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10 font-black text-amber-200">
                      {index + 1}
                    </span>
                    <div>
                      <p className="font-black">{standing.displayName}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-zinc-500">
                        {standing.isCorrect ? "Correct" : "Waiting / incorrect"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black">{standing.score}</p>
                    <p className="text-xs text-zinc-500">+{standing.roundPoints} this round</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
