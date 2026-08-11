"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  AlertTriangle,
  ArrowLeft,
  RefreshCw,
} from "lucide-react";

import { leaveCurrentRoom } from "@/lib/db/movieBuff";
import {
  buildMovieBuffPhaseRouteHref,
  getMovieBuffMatchPhaseView,
  type MovieBuffMatchPhaseView,
} from "@/lib/game/movieBuffPhaseService";

function getCountdownSeconds(
  deadline: string | null | undefined
) {
  if (!deadline) {
    return null;
  }

  const milliseconds =
    new Date(deadline).getTime() - Date.now();

  if (!Number.isFinite(milliseconds)) {
    return null;
  }

  return Math.max(
    0,
    Math.ceil(milliseconds / 1000)
  );
}

export default function MovieBuffMatchStatusPage() {
  const router = useRouter();
  const [phaseView, setPhaseView] =
    useState<MovieBuffMatchPhaseView | null>(
      null
    );
  const [roomId, setRoomId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] =
    useState(true);
  const [leaving, setLeaving] =
    useState(false);
  const [, setNowTick] = useState(() =>
    Date.now()
  );

  const navigateTo = useCallback(
    (destination: string, replace = false) => {
      if (replace) {
        router.replace(destination);
        return;
      }

      router.push(destination);
    },
    [router]
  );

  const refreshPhaseView = useCallback(
    async (
      resolvedRoomId: string,
      allowRedirect = true
    ) => {
      const nextPhaseView =
        await getMovieBuffMatchPhaseView(
          resolvedRoomId
        );
      const destination =
        buildMovieBuffPhaseRouteHref(
          nextPhaseView,
          resolvedRoomId
        );

      if (
        allowRedirect &&
        destination &&
        nextPhaseView.phaseRoute !==
          "/games/movie-buff/match-status"
      ) {
        navigateTo(destination, true);
        return null;
      }

      setPhaseView(nextPhaseView);
      setError("");
      return nextPhaseView;
    },
    [navigateTo]
  );

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const parameters =
          new URLSearchParams(
            window.location.search
          );
        const resolvedRoomId =
          parameters.get("roomId") ?? "";

        if (!resolvedRoomId) {
          navigateTo(
            "/games/movie-buff/lobby",
            true
          );
          return;
        }

        setRoomId(resolvedRoomId);
        await refreshPhaseView(resolvedRoomId);
      } catch (loadError) {
        if (!active) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load the live match status."
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [navigateTo, refreshPhaseView]);

  useEffect(() => {
    if (!roomId) {
      return;
    }

    let active = true;

    const phaseTimer = window.setInterval(() => {
      void refreshPhaseView(roomId).catch(
        (refreshError) => {
          if (!active) {
            return;
          }

          setError(
            refreshError instanceof Error
              ? refreshError.message
              : "Unable to refresh the live match status."
          );
        }
      );
    }, 1500);

    const countdownTimer =
      window.setInterval(() => {
        if (active) {
          setNowTick(Date.now());
        }
      }, 1000);

    return () => {
      active = false;
      window.clearInterval(phaseTimer);
      window.clearInterval(countdownTimer);
    };
  }, [refreshPhaseView, roomId]);

  const statusMessage = useMemo(() => {
    if (!phaseView) {
      return "Checking the authoritative Movie Buff phase state.";
    }

    if (phaseView.phase === "abandoned") {
      return "This room was marked abandoned because the active participant did not reconnect in time.";
    }

    if (phaseView.phase === "blocked") {
      return (
        phaseView.blockedReason ??
        "The match is blocked and needs a fresh authoritative phase update."
      );
    }

    return `The live phase is currently ${phaseView.phase}.`;
  }, [phaseView]);

  async function handleLeaveRoom() {
    if (!roomId || leaving) {
      return;
    }

    setLeaving(true);
    setError("");

    try {
      await leaveCurrentRoom(roomId);
      navigateTo("/games/movie-buff/lobby");
    } catch (leaveError) {
      setError(
        leaveError instanceof Error
          ? leaveError.message
          : "Unable to leave the room."
      );
    } finally {
      setLeaving(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <p className="text-2xl font-black">
          Loading match status...
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="mx-auto max-w-5xl px-6 py-10">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-8">
          <p className="text-sm font-black uppercase tracking-[0.28em] text-red-500">
            Match status
          </p>

          <div className="mt-4 flex items-start gap-4">
            <div className="rounded-2xl bg-red-600/15 p-4 text-red-400">
              <AlertTriangle size={28} />
            </div>

            <div>
              <h1 className="text-4xl font-black">
                Movie Buff live phase status
              </h1>
              <p className="mt-3 max-w-3xl text-zinc-400">
                {statusMessage}
              </p>
            </div>
          </div>

          {error ? (
            <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm font-bold text-red-200">
              {error}
            </div>
          ) : null}

          <div className="mt-8 flex flex-wrap gap-4">
            <button
              type="button"
              onClick={() =>
                void refreshPhaseView(
                  roomId,
                  true
                )
              }
              className="flex items-center gap-2 rounded-xl border border-zinc-700 px-5 py-3 font-black text-zinc-200 transition hover:border-red-500 hover:text-white"
            >
              <RefreshCw size={18} />
              Refresh status
            </button>

            <button
              type="button"
              onClick={handleLeaveRoom}
              disabled={leaving}
              className="flex items-center gap-2 rounded-xl border border-zinc-700 px-5 py-3 font-black text-zinc-200 transition hover:border-red-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ArrowLeft size={18} />
              {leaving
                ? "Leaving..."
                : "Return to lobby"}
            </button>
          </div>
        </div>

        {phaseView ? (
          <div className="mt-6 rounded-3xl border border-zinc-800 bg-zinc-950 p-8">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Phase"
                value={phaseView.phase}
              />
              <StatCard
                label="Round"
                value={`${phaseView.roundNumber} / ${phaseView.totalRounds}`}
              />
              <StatCard
                label="Route"
                value={
                  phaseView.phaseRoute ??
                  "Unavailable"
                }
              />
              <StatCard
                label="Phase version"
                value={String(
                  phaseView.phaseVersion
                )}
              />
            </div>

            <div className="mt-8 space-y-4">
              {phaseView.participants.map(
                (participant) => (
                  <div
                    key={`${participant.seatIndex}-${participant.playerId ?? "open"}`}
                    className="rounded-2xl border border-zinc-800 bg-black/60 p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.22em] text-zinc-500">
                          Seat {participant.seatIndex}
                        </p>
                        <p className="mt-2 text-xl font-black">
                          {participant.playerId ??
                            "Open seat"}
                        </p>
                        <p className="mt-2 text-sm text-zinc-400">
                          State:{" "}
                          {participant.participantState}
                        </p>
                      </div>

                      <div className="text-right text-sm text-zinc-400">
                        <p>
                          Score:{" "}
                          {participant.score.toLocaleString()}
                        </p>
                        <p className="mt-2">
                          Reconnect window:{" "}
                          {participant.reconnectDeadlineAt
                            ? `${getCountdownSeconds(
                                participant.reconnectDeadlineAt
                              )}s`
                            : "n/a"}
                        </p>
                        <p className="mt-2">
                          Replacement ready:{" "}
                          {participant.replacementReadyAt
                            ? `${getCountdownSeconds(
                                participant.replacementReadyAt
                              )}s`
                            : "n/a"}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-black/60 p-4">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-zinc-500">
        {label}
      </p>
      <p className="mt-2 break-words text-sm font-black text-white">
        {value}
      </p>
    </div>
  );
}
