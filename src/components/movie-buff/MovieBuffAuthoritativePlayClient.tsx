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
  const playbackRetryRef = useRef<number | null>(null);
  const [phase, setPhase] = useState<MovieBuffAuthoritativePhaseView | null>(null);
  const [round, setRound] = useState<MovieBuffRound | null>(null);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [nowMs, setNowMs] = useState(Date.now());
  const [answer, setAnswer] = useState("");
  const [answerResult, setAnswerResult] = useState<MovieBuffAnswerResult | null>(null);
  const [hintPending, setHintPending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [playbackRecovering, setPlaybackRecovering] = useState(false);
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

  const playAtAuthoritativeOffset = useCallback(
    async function attemptPlayback() {
      const media = mediaRef.current;
      const startsAt = phase?.playbackStartsAt;
      const playbackPhase = phase?.phase;

      if (
        !media ||
        !startsAt ||
        !playbackPhase ||
        !["transition", "playback", "answer"].includes(playbackPhase)
      ) {
        return;
      }

      const authoritativeNow = Date.now() + serverOffsetMs;
      const elapsedSeconds = Math.max(
        0,
        (authoritativeNow - new Date(startsAt).getTime()) / 1000,
      );
      const boundedTarget = Number.isFinite(media.duration)
        ? Math.min(elapsedSeconds, Math.max(0, media.duration - 0.05))
        : elapsedSeconds;

      if (Math.abs(media.currentTime - boundedTarget) > 0.35) {
        try {
          media.currentTime = boundedTarget;
        } catch {
          // Metadata may still be loading. The automatic retry below will resync.
        }
      }

      try {
        await media.play();
        if (playbackRetryRef.current !== null) {
          window.clearTimeout(playbackRetryRef.current);
          playbackRetryRef.current = null;
        }
        setPlaybackRecovering(false);
      } catch {
        setPlaybackRecovering(true);
        if (playbackRetryRef.current === null) {
          playbackRetryRef.current = window.setTimeout(() => {
            playbackRetryRef.current = null;
            void attemptPlayback();
          }, 400);
        }
      }
    },
    [phase?.phase, phase?.playbackStartsAt, serverOffsetMs],
  );

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

  useEffect(() => {
    return () => {
      if (playbackRetryRef.current !== null) {
        window.clearTimeout(playbackRetryRef.current);
        playbackRetryRef.current = null;
      }
    };
  }, []);

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
      <main className="flex min-h-screen items-center justify-center overflow-x-hidden bg-black px-6 text-white">
        <div className="min-w-0 text-center">
          <Film className="mx-auto animate-pulse text-red-500" size={48} />
          <p className="mt-4 text-2xl font-black">Synchronizing the shared scene...</p>
          {error ? <p className="mt-4 break-words text-red-300">{error}</p> : null}
        </div>
      </main>
    );
  }

  const isTransition = phase.phase === "transition";
  const answerOpen = phase.phase === "answer" && answerRemainingSeconds > 0;
  const resyncMedia = () => void playAtAuthoritativeOffset();

  return (
    <main className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,_rgba(127,29,29,0.28),_transparent_34%),linear-gradient(180deg,#090909_0%,#000_100%)] px-5 py-8 text-white">
      <section className="mx-auto min-w-0 max-w-6xl">
        <header className="flex min-w-0 flex-wrap items-end justify-between gap-5 rounded-3xl border border-red-500/20 bg-zinc-950/90 p-6">
          <div className="min-w-0">
            <p className="break-words text-xs font-black uppercase tracking-[0.3em] text-red-400">Synchronized Clip</p>
            <h1 className="mt-2 text-4xl font-black">Round {phase.roundNumber}</h1>
            <p className="mt-2 text-zinc-500">{phase.roundNumber} of {phase.totalRounds}</p>
          </div>
          <div className="max-w-full min-w-0 rounded-2xl border border-zinc-800 bg-black px-5 py-4 text-right">
            <p className="break-words text-xs font-black uppercase tracking-[0.2em] text-zinc-500">Authoritative phase</p>
            <p className="mt-1 break-words font-black capitalize">{phase.phase.replaceAll("_", " ")} · v{phase.phaseVersion}</p>
          </div>
        </header>

        {error ? (
          <div className="mt-5 min-w-0 break-words rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 font-bold text-red-200">
            {error}
          </div>
        ) : null}

        <div className="mt-6 w-full min-w-0 overflow-hidden rounded-[2rem] border border-zinc-800 bg-zinc-950 shadow-2xl">
          {isTransition ? (
            <div className="flex aspect-video min-w-0 flex-col items-center justify-center bg-[linear-gradient(135deg,#240606,#050505)] px-6 text-center sm:px-8">
              <Film size={58} className="text-amber-300" />
              <p className="mt-5 break-words text-xs font-black uppercase tracking-[0.35em] text-amber-300">Scene locked</p>
              <h2 className="mt-3 break-words text-3xl font-black sm:text-4xl">Curtain and film slate</h2>
              <p className="mt-4 break-words text-zinc-400">Playback begins for every client from one server timestamp.</p>
              <p className="mt-6 text-5xl font-black tabular-nums sm:text-6xl">{playbackStartsIn}</p>
            </div>
          ) : round.clipType === "audio" ? (
            <div className="flex aspect-video min-w-0 flex-col items-center justify-center bg-black px-6 text-center sm:px-8">
              <Volume2 size={64} className="text-red-400" />
              <p className="mt-5 text-2xl font-black">Listen closely</p>
              <audio
                data-testid="movie-buff-shared-media"
                ref={(node) => {
                  mediaRef.current = node;
                }}
                src={round.mediaUrl ?? undefined}
                preload="auto"
                onCanPlay={resyncMedia}
                onLoadedData={resyncMedia}
                onLoadedMetadata={resyncMedia}
              />
            </div>
          ) : round.clipType === "video" && round.mediaUrl ? (
            <video
              data-testid="movie-buff-shared-media"
              ref={(node) => {
                mediaRef.current = node;
              }}
              src={round.mediaUrl}
              preload="auto"
              playsInline
              className="aspect-video w-full min-w-0 bg-black object-contain"
              onCanPlay={resyncMedia}
              onLoadedData={resyncMedia}
              onLoadedMetadata={resyncMedia}
            />
          ) : (
            <div className="flex aspect-video min-w-0 items-center justify-center bg-black px-6 text-center sm:px-8">
              <p className="max-w-3xl break-words text-2xl font-black sm:text-3xl">{round.quoteText ?? round.prompt ?? "The selected media is unavailable."}</p>
            </div>
          )}
        </div>

        {playbackRecovering ? (
          <p
            role="status"
            data-testid="movie-buff-playback-recovering"
            className="mt-4 w-full min-w-0 break-words rounded-xl border border-amber-400/40 bg-amber-500/10 px-5 py-4 text-center font-black text-amber-100"
          >
            Synchronizing playback automatically at the current server position…
          </p>
        ) : null}

        <div className="mt-6 grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
          <section className="min-w-0 rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
            <form onSubmit={submit} className="min-w-0">
              <label htmlFor="movie-answer" className="break-words text-xs font-black uppercase tracking-[0.25em] text-zinc-500">
                Name the movie
              </label>
              <div className="mt-3 flex min-w-0 flex-col gap-3 sm:flex-row">
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
                  className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-3 font-black disabled:opacity-50 sm:w-auto"
                >
                  <Send size={18} /> Submit
                </button>
              </div>
            </form>

            {answerResult ? (
              <div className={`mt-5 min-w-0 rounded-2xl border p-5 ${answerResult.isCorrect ? "border-emerald-500/30 bg-emerald-500/10" : "border-red-500/30 bg-red-500/10"}`}>
                <p className="text-xl font-black">{answerResult.isCorrect ? "Correct" : "Answer locked"}</p>
                <p className="mt-2 break-words text-zinc-300">{answerResult.isCorrect ? `+${answerResult.totalPoints} points` : "Waiting for synchronized results."}</p>
              </div>
            ) : null}

            {round.hintUsed && round.hintText ? (
              <div className="mt-5 min-w-0 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-amber-100">
                <p className="text-xs font-black uppercase tracking-[0.2em]">Personal hint</p>
                <p className="mt-2 break-words font-bold">{round.hintText}</p>
              </div>
            ) : null}
          </section>

          <aside className="min-w-0 space-y-4">
            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6 text-center">
              <Clock3 className="mx-auto text-red-400" />
              <p className="mt-3 break-words text-xs font-black uppercase tracking-[0.2em] text-zinc-500">Answer time</p>
              <p className="mt-2 text-5xl font-black tabular-nums sm:text-6xl">{answerRemainingSeconds}</p>
            </div>
            <button
              type="button"
              disabled={!answerOpen || hintPending || round.hintUsed}
              onClick={() => void useHint()}
              className="flex w-full min-w-0 items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-center font-black text-amber-100 disabled:opacity-50"
            >
              <Lightbulb size={18} /> {round.hintUsed ? "Hint used" : hintPending ? "Loading hint..." : "Use hint (-5 sec)"}
            </button>
          </aside>
        </div>
      </section>
    </main>
  );
}
