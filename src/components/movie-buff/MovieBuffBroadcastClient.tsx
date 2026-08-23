"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  MovieBuffBroadcastProjection,
} from "@/lib/movie-buff-live/broadcastProjection";

function formatPhase(phase: string | null): string {
  if (!phase) {
    return "Casting contestants";
  }

  return phase
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatStatus(status: string): string {
  return status
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "M")
      .join("") || "MB"
  );
}

function secondsUntil(iso: string | null, now: number): number | null {
  if (!iso) {
    return null;
  }

  const timestamp = new Date(iso).getTime();

  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return Math.max(0, Math.ceil((timestamp - now) / 1000));
}

export default function MovieBuffBroadcastClient({
  showKey,
  initialProjection,
  initialError,
}: {
  showKey: string;
  initialProjection: MovieBuffBroadcastProjection | null;
  initialError: string | null;
}) {
  const [projection, setProjection] =
    useState<MovieBuffBroadcastProjection | null>(initialProjection);
  const [error, setError] = useState(initialError ?? "");
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/movie-buff/live/broadcast?showKey=${encodeURIComponent(showKey)}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as
        | MovieBuffBroadcastProjection
        | { error?: string };

      if (!response.ok || !("show" in payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "The broadcast scene is unavailable.",
        );
      }

      setProjection(payload);
      setError("");
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "The broadcast scene is unavailable.",
      );
    }
  }, [showKey]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
      void refresh();
    }, 2500);

    return () => window.clearInterval(interval);
  }, [refresh]);

  const phaseSeconds = secondsUntil(
    projection?.show.currentPhaseEndsAt ?? null,
    now,
  );
  const contestants = projection?.show.contestants ?? [];
  const categories = projection?.board.categories ?? [];
  const status = projection?.show.status ?? "connecting";
  const statusLabel = formatStatus(status);
  const phaseLabel = formatPhase(projection?.show.currentPhase ?? null);
  const currentPhase = projection?.show.currentPhase ?? null;
  const media = projection?.media ?? null;
  const mediaCanPlay =
    currentPhase !== null &&
    ["playback", "answer", "results"].includes(currentPhase);
  const signalLabel = useMemo(() => {
    if (error) {
      return "Signal check";
    }

    if (status === "live") {
      return "Live stage";
    }

    if (status === "waiting_for_contestants") {
      return "Casting now";
    }

    return statusLabel;
  }, [error, status, statusLabel]);

  return (
    <main
      data-testid="movie-buff-broadcast-composition"
      className="min-h-screen overflow-hidden bg-[#04050a] text-white"
    >
      <div
        className="pointer-events-none fixed inset-0 opacity-80 [background:radial-gradient(circle_at_50%_0%,rgba(231,181,73,.18),transparent_32%),radial-gradient(circle_at_0%_45%,rgba(152,22,58,.23),transparent_35%),radial-gradient(circle_at_100%_45%,rgba(15,75,126,.24),transparent_35%),linear-gradient(180deg,#08060c_0%,#05050a_55%,#020307_100%)]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed inset-x-0 top-0 h-3 bg-[repeating-linear-gradient(90deg,#f5c14e_0_12px,transparent_12px_28px)] opacity-80"
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-[1900px] px-4 py-7 sm:px-8 lg:px-12">
        <header className="relative overflow-hidden rounded-[2rem] border border-amber-300/45 bg-gradient-to-r from-[#100811] via-[#10162d] to-[#100811] px-5 py-5 shadow-[0_0_70px_rgba(248,189,62,.12)] sm:px-9 sm:py-7">
          <div
            className="pointer-events-none absolute inset-x-6 top-2 h-px bg-gradient-to-r from-transparent via-amber-200 to-transparent opacity-70"
            aria-hidden="true"
          />
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.34em] text-rose-300">
                The live movie stage
              </p>
              <p className="mt-1 text-sm font-bold uppercase tracking-[0.25em] text-zinc-400">
                Episode {projection?.show.episodeNumber ?? 0}
              </p>
            </div>

            <div className="text-center">
              <h1 className="text-4xl font-black uppercase leading-[0.78] tracking-[0.12em] text-amber-100 drop-shadow-[0_0_20px_rgba(255,206,94,.7)] sm:text-6xl">
                <span className="block">Movie</span>
                <span className="block">Buff</span>
              </h1>
              <p className="mt-3 text-[10px] font-black uppercase tracking-[0.3em] text-amber-300">
                Lights · Camera · Guess
              </p>
            </div>

            <div className="flex items-center gap-3 rounded-full border border-emerald-300/45 bg-emerald-300/10 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-emerald-200">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,.9)]" />
              {signalLabel}
            </div>
          </div>
        </header>

        {error ? (
          <div
            role="status"
            className="mt-4 rounded-2xl border border-rose-400/40 bg-rose-950/45 px-5 py-3 text-sm font-semibold text-rose-100"
          >
            {error}
          </div>
        ) : null}

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section
            aria-label="Movie Buff broadcast board"
            className="rounded-[2rem] border border-amber-300/35 bg-[#08101f]/90 p-4 shadow-2xl shadow-black/50 sm:p-6"
          >
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-300">
                  On the big screen
                </p>
                <h2 className="mt-2 text-2xl font-black sm:text-3xl">
                  {projection?.board.headline ?? "Movie Buff"}
                </h2>
                <p className="mt-1 text-sm text-zinc-400">
                  {projection?.board.supportLine ?? "Watch. Guess. Win."}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/25 px-4 py-2 text-right">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
                  Scene
                </p>
                <p className="mt-1 text-lg font-black text-amber-100">
                  {phaseLabel}
                </p>
                {phaseSeconds !== null ? (
                  <p className="text-xs text-zinc-500">
                    {phaseSeconds}s remaining
                  </p>
                ) : null}
              </div>
            </div>

            {media ? (
              <div className="mb-5 overflow-hidden rounded-2xl border border-amber-300/30 bg-black shadow-[0_0_32px_rgba(0,0,0,.45)]">
                <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/[0.04] px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">
                  <span>{mediaCanPlay ? "Now playing" : "Next clip"}</span>
                  <span className="text-amber-200">Movie moment</span>
                </div>
                {media.clipType === "audio" ? (
                  <div className="flex min-h-28 items-center justify-center px-6">
                    <audio
                      key={`${media.roundId}:${currentPhase}`}
                      src={media.url}
                      autoPlay={mediaCanPlay}
                      controls={false}
                      preload="auto"
                      aria-label="Movie Buff audio clip"
                    />
                    <p className="text-center text-sm text-zinc-400">
                      The movie moment is playing for the broadcast audience.
                    </p>
                  </div>
                ) : (
                  <video
                    key={`${media.roundId}:${currentPhase}`}
                    src={media.url}
                    autoPlay={mediaCanPlay}
                    controls={false}
                    playsInline
                    preload="auto"
                    className="aspect-video w-full object-cover"
                    aria-label="Movie Buff video clip"
                  />
                )}
              </div>
            ) : null}

            {categories.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {categories.map((category) => (
                  <section
                    key={category.id}
                    aria-label={`${category.label} category`}
                    className="overflow-hidden rounded-xl border border-sky-300/35 bg-[#071a3b]"
                  >
                    <h3 className="flex min-h-14 items-center justify-center border-b border-amber-300/30 bg-gradient-to-b from-[#5d1c43] to-[#21142f] px-2 text-center text-xs font-black uppercase tracking-[0.12em] text-amber-100 sm:text-sm">
                      {category.label}
                    </h3>
                    <div className="space-y-1.5 p-1.5">
                      {category.tiles.map((tile) => (
                        <div
                          key={tile.id}
                          data-tile-status={tile.status}
                          className={`flex min-h-12 items-center justify-center rounded-lg border px-1 text-lg font-black text-amber-200 sm:min-h-14 sm:text-xl ${
                            tile.status === "used"
                              ? "border-slate-700/60 bg-slate-950/70 text-slate-600"
                              : tile.status === "locked"
                                ? "border-amber-200 bg-amber-300/20 text-amber-50 shadow-[0_0_18px_rgba(252,211,77,.35)]"
                                : "border-sky-300/40 bg-gradient-to-b from-[#123d78] to-[#09224b]"
                          }`}
                        >
                          {tile.status === "used" ? "—" : tile.pointValue}
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-dashed border-white/15 bg-black/20 text-center text-zinc-400">
                The stage board is preparing for the next episode.
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-xs uppercase tracking-[0.16em] text-zinc-500">
              <span>{projection?.board.totalTiles ?? 0} playable spaces</span>
              <span>{statusLabel}</span>
              <span>Public broadcast composition</span>
            </div>
          </section>

          <aside className="space-y-6">
            <section className="rounded-[2rem] border border-rose-300/30 bg-gradient-to-br from-[#251022] to-[#080b18] p-5 shadow-2xl shadow-black/40 sm:p-6">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-amber-300/70 bg-amber-300/15 text-2xl shadow-[0_0_24px_rgba(252,211,77,.22)]">
                  🎬
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.28em] text-rose-300">
                    Host booth
                  </p>
                  <h2 className="mt-1 text-2xl font-black text-amber-100">
                    Cinephile Cinematic
                  </h2>
                  <p className="mt-1 text-xs uppercase tracking-[0.2em] text-zinc-400">
                    with Buster
                  </p>
                </div>
              </div>
              <p
                aria-live="polite"
                className="mt-5 rounded-2xl border border-amber-300/25 bg-black/25 p-4 text-sm leading-6 text-zinc-200"
              >
                {projection?.host.text ??
                  "Cinephile Cinematic is preparing the next scene."}
              </p>
            </section>

            <section className="rounded-[2rem] border border-sky-300/25 bg-[#07111f]/90 p-5 sm:p-6">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.28em] text-sky-300">
                    Contestant row
                  </p>
                  <h2 className="mt-1 text-2xl font-black">On stage</h2>
                </div>
                <span className="text-2xl font-black text-amber-200">
                  {contestants.length}/3
                </span>
              </div>

              <div className="mt-5 space-y-3">
                {contestants.map((contestant) => (
                  <div
                    key={`${contestant.seatIndex}-${contestant.displayName}`}
                    className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/25 p-3"
                  >
                    <div
                      className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-amber-300/60 bg-amber-300/15 text-sm font-black text-amber-100"
                      role="img"
                      aria-label={`${contestant.displayName} avatar`}
                      style={
                        contestant.avatarUrl
                          ? {
                              backgroundImage: `url("${contestant.avatarUrl}")`,
                              backgroundPosition: "center",
                              backgroundSize: "cover",
                            }
                          : undefined
                      }
                    >
                      {!contestant.avatarUrl
                        ? initials(contestant.displayName)
                        : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-black text-white">
                        {contestant.displayName}
                      </p>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                        Seat {contestant.seatIndex} · {contestant.participantState}
                      </p>
                    </div>
                    <p className="text-lg font-black text-amber-200">
                      {contestant.score.toLocaleString()}
                    </p>
                  </div>
                ))}

                {!contestants.length ? (
                  <div className="rounded-2xl border border-dashed border-white/15 p-6 text-center text-sm text-zinc-400">
                    The studio is casting the next three contestants.
                  </div>
                ) : null}
              </div>
            </section>
          </aside>
        </div>

        <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 px-2 text-[10px] font-black uppercase tracking-[0.24em] text-zinc-600">
          <span>Movie Buff Live · {showKey}</span>
          <span>Lights · Camera · Guess</span>
        </footer>
      </div>
    </main>
  );
}
