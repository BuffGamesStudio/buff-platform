"use client";

import { useRouter } from "next/navigation";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Clock3, Film, Lightbulb, Send, Volume2 } from "lucide-react";

import {
  getMovieBuffAuthoritativePhase,
  type MovieBuffAuthoritativePhaseView,
} from "@/lib/game/movieBuffAuthoritativePhaseClient";
import {
  getCurrentMovieBuffRound,
  requestMovieBuffRoundHint,
  submitMovieBuffAnswer,
  type MovieBuffAnswerResult,
  type MovieBuffRound,
} from "@/lib/game/roundService";

type MediaElement = HTMLVideoElement | HTMLAudioElement;

export default function MovieBuffAuthoritativePlayClient({
  roomId,
}: {
  roomId: string;
}) {
  const router = useRouter();
  const mediaRef = useRef<MediaElement | null>(null);
  const playbackTimerRef = useRef<number | null>(null);
  const [phase, setPhase] = useState<MovieBuffAuthoritativePhaseView | null>(null);
  const [round, setRound] = useState<MovieBuffRound | null>(null);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [nowMs, setNowMs] = useState(Date.now());
  const [answer, setAnswer] = useState("");
  const [answerResult, setAnswerResult] = useState<MovieBuffAnswerResult | null>(null);
  const [hintPending, setHintPending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const [nextPhase, nextRound] = await Promise.all([
        getMovieBuffAuthoritativePhase(roomId),
        getCurrentMovieBuffRound(roomId),
      ]);
      setPhase(nextPhase);
      setRound(nextRound);
      setServerOffsetMs(new Date(nextPhase.serverNow).getTime() - Date.now());
    } catch (loadError) {
      if (loadError instanceof Error && loadError.message === "SIGN_IN_REQUIRED") {
        router.replace(
          `/sign-in?next=${encodeURIComponent(`/games/movie-buff/play?roomId=${roomId}`)}`,
        );
        return;
      }
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to synchronize the shared clip.",
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

  const playAtAuthoritativeOffset = useCallback(async () => {
    const media = mediaRef.current;
    const startsAt = phase?.playbackStartsAt;
    if (!media || !startsAt) return;

    const authoritativeNow = Date.now() + serverOffsetMs;
    const elapsedSeconds = Math.max(
      0,
      (authoritativeNow - new Date(startsAt).getTime()) / 1000,
    );
    const boundedTarget = Number.isFinite(media.duration)
      ? Math.min(elapsedSeconds, Math.max(0, media.duration - 0.05))
      : elapsedSeconds;

    if (Math.abs(media.currentTime - boundedTarget) > 0.35) {
      media.currentTime = boundedTarget;
    }

    try {
      await media.play();
      setAutoplayBlocked(false);
    } catch {
      setAutoplayBlocked(true);
    }
  }, [phase?.playbackStartsAt, serverOffsetMs]);

  useEffect(() => {
    if (playbackTimerRef.current !== null) {
      window.clearTimeout(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }

    if (!phase?.playbackStartsAt || !round?.mediaUrl) return;
    if (!["transition", "playback", "answer"].includes(phase.phase)) return;

    const delay = Math.max(
      0,
      new Date(phase.playbackStartsAt).getTime() - (Date.now() + serverOffsetMs),
    );
    playbackTimerRef.current = window.setTimeout(
      () => void playAtAuthoritativeOffset(),
      delay,
    );

    return () => {
      if (playbackTimerRef.current !== null) {
        window.clearTimeout(playbackTimerRef.current);
        playbackTimerRef.current = null;
      }
    };
  }, [phase?.phase, phase?.playbackStartsAt, playAtAuthoritativeOffset, round?.mediaUrl, serverOffsetMs]);

  const answerRemainingSeconds = useMemo(() => {
    if (!phase?.answerDeadlineAt) return 0;
    return Math.max(
      0,
      Math.ceil(
        (new Date(phase.answerDeadlineAt).getTime() - (nowMs + serverOffsetMs)) /
          1000,
      ),
    );
  }, [nowMs, phase?.answerDeadlineAt, serverOffsetMs]);

  const playbackStartsIn = useMemo(() => {
    if (!phase?.playbackStartsAt) return 0;
    return Math.max(
      0,
      Math.ceil(
        (new Date(phase.playbackStartsAt).getTime() - (nowMs + serverOffsetMs)) /
          1000,
      ),
    );
  }, [nowMs, phase?.playbackStartsAt, serverOffsetMs]);

  async function useHint() {
    if (hintPending || phase?.phase !== "answer") return;
    setHintPending(true);
    setError("");
    try {
      setRound(await requestMovieBuffRoundHint(roomId, 5));
    } catch (hintError) {
      setError(
        hintError instanceof Error ? hintError.message : "Unable to request hint.",
      );
    } finally {
      setHintPending(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = answer.trim();
    if (
      !normalized ||
      submitting ||
      phase?.phase !== "answer" ||
      answerRemainingSeconds <= 0
    ) {
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      setAnswerResult(await submitMovieBuffAnswer(roomId, normalized));
      setAnswer("");
      await load();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to submit answer.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!phase || !round) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
        <div className="text-center">
          <Film className="mx-auto animate-pulse text-red-500" size={48} />
          <p className="mt-4 text-2xl font-black">Synchronizing the shared scene...</p>
          {error ? <p className="mt-4 text-red-300">{error}</p> : null}
        </div>
      </main>
    );
  }

  const isTransition = phase.phase === "transition";
  const answerOpen = phase.phase === "answer" && answerRemainingSeconds > 0;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(127,29,29,0.28),_transparent_34%),linear-gradient(180deg,#090909_0%,#000_100%)] px-5 py-8 text-white">
      <section className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-end justify-between gap-5 rounded-3xl border border-red-500/20 bg-zinc-950/90 p-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-red-400">Synchronized Clip</p>
            <h1 className="mt-2 text-4xl font-black">Round {phase.roundNumber}</h1>
            <p className="mt-2 text-zinc-500">{phase.roundNumber} of {phase.totalRounds}</p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-black px-5 py-4 text-right">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">Authoritative phase</p>
            <p className="mt-1 font-black capitalize">{phase.phase.replaceAll("_", " ")} · v{phase.phaseVersion}</p>
          </div>
        </header>

        {error ? (
          <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 font-bold text-red-200">
            {error}
          </div>
        ) : null}

        <div className="mt-6 overflow-hidden rounded-[2rem] border border-zinc-800 bg-zinc-950 shadow-2xl">
          {isTransition ? (
            <div className="flex aspect-video flex-col items-center justify-center bg-[linear-gradient(135deg,#240606,#050505)] px-8 text-center">
              <Film size={58} className="text-amber-300" />
              <p className="mt-5 text-xs font-black uppercase tracking-[0.35em] text-amber-300">Scene locked</p>
              <h2 className="mt-3 text-4xl font-black">Curtain and film slate</h2>
              <p className="mt-4 text-zinc-400">Playback begins for every client from one server timestamp.</p>
              <p className="mt-6 text-6xl font-black tabular-nums">{playbackStartsIn}</p>
            </div>
          ) : round.clipType === "audio" ? (
            <div className="flex aspect-video flex-col items-center justify-center bg-black px-8 text-center">
              <Volume2 size={64} className="text-red-400" />
              <p className="mt-5 text-2xl font-black">Listen closely</p>
              <audio
                ref={(node) => {
                  mediaRef.current = node;
                }}
                src={round.mediaUrl ?? undefined}
                preload="auto"
                onLoadedMetadata={() => void playAtAuthoritativeOffset()}
              />
            </div>
          ) : round.clipType === "video" && round.mediaUrl ? (
            <video
              ref={(node) => {
                mediaRef.current = node;
              }}
              src={round.mediaUrl}
              preload="auto"
              playsInline
              className="aspect-video w-full bg-black object-contain"
              onLoadedMetadata={() => void playAtAuthoritativeOffset()}
            />
          ) : (
            <div className="flex aspect-video items-center justify-center bg-black px-8 text-center">
              <p className="max-w-3xl text-3xl font-black">{round.quoteText ?? round.prompt ?? "The selected media is unavailable."}</p>
            </div>
          )}
        </div>

        {autoplayBlocked ? (
          <button
            type="button"
            onClick={() => void playAtAuthoritativeOffset()}
            className="mt-4 w-full rounded-xl border border-amber-400/40 bg-amber-500/10 px-5 py-4 font-black text-amber-100"
          >
            Start synchronized playback at the current server position
          </button>
        ) : null}

        <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_260px]">
          <section className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
            <form onSubmit={submit}>
              <label htmlFor="movie-answer" className="text-xs font-black uppercase tracking-[0.25em] text-zinc-500">
                Name the movie
              </label>
              <div className="mt-3 flex gap-3">
                <input
                  id="movie-answer"
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  disabled={!answerOpen || submitting || answerResult !== null}
                  className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-black px-4 py-3 font-bold outline-none focus:border-red-400 disabled:opacity-50"
                  placeholder={answerOpen ? "Type your answer" : "Waiting for the shared answer window"}
                />
                <button
                  type="submit"
                  disabled={!answerOpen || submitting || !answer.trim() || answerResult !== null}
                  className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-3 font-black disabled:opacity-50"
                >
                  <Send size={18} /> Submit
                </button>
              </div>
            </form>

            {answerResult ? (
              <div className={`mt-5 rounded-2xl border p-5 ${answerResult.isCorrect ? "border-emerald-500/30 bg-emerald-500/10" : "border-red-500/30 bg-red-500/10"}`}>
                <p className="text-xl font-black">{answerResult.isCorrect ? "Correct" : "Answer locked"}</p>
                <p className="mt-2 text-zinc-300">{answerResult.isCorrect ? `+${answerResult.totalPoints} points` : "Waiting for synchronized results."}</p>
              </div>
            ) : null}

            {round.hintUsed && round.hintText ? (
              <div className="mt-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-amber-100">
                <p className="text-xs font-black uppercase tracking-[0.2em]">Personal hint</p>
                <p className="mt-2 font-bold">{round.hintText}</p>
              </div>
            ) : null}
          </section>

          <aside className="space-y-4">
            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6 text-center">
              <Clock3 className="mx-auto text-red-400" />
              <p className="mt-3 text-xs font-black uppercase tracking-[0.2em] text-zinc-500">Answer time</p>
              <p className="mt-2 text-6xl font-black tabular-nums">{answerRemainingSeconds}</p>
            </div>
            <button
              type="button"
              disabled={!answerOpen || hintPending || round.hintUsed}
              onClick={() => void useHint()}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 font-black text-amber-100 disabled:opacity-50"
            >
              <Lightbulb size={18} /> {round.hintUsed ? "Hint used" : hintPending ? "Loading hint..." : "Use hint (-5 sec)"}
            </button>
          </aside>
        </div>
      </section>
    </main>
  );
}
