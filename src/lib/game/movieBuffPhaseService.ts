import { supabase } from "@/lib/supabase";

export type MovieBuffSharedPhase =
  | "round_intro"
  | "vip_selection"
  | "board"
  | "board_transition"
  | "clip_ready"
  | "clip_playback"
  | "answer"
  | "results"
  | "match_complete";

export type MovieBuffPhaseView = {
  roomId: string;
  matchId: string;
  roundId: string | null;
  roundNumber: number;
  phase: MovieBuffSharedPhase;
  version: number;
  phaseStartedAt: string;
  phaseDeadlineAt: string | null;
  selectorPlayerId: string | null;
  selectedTileId: string | null;
  clipId: string | null;
  playbackStartedAt: string | null;
  serverNow: string;
};

async function phaseRequest<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token || session.user.is_anonymous === true) {
    throw new Error("SIGN_IN_REQUIRED");
  }

  const response = await fetch(path, {
    method: "POST",
    cache: "no-store",
    headers: {
      authorization: `Bearer ${session.access_token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;

  if (!response.ok || !payload) {
    throw new Error(payload?.error ?? "Unable to synchronize Movie Buff phase.");
  }

  return payload;
}

export async function getMovieBuffPhaseView(
  roomId: string,
): Promise<MovieBuffPhaseView> {
  const payload = await phaseRequest<{ phase: MovieBuffPhaseView }>(
    "/api/movie-buff/phase/view",
    { roomId },
  );
  return payload.phase;
}

export async function requestMovieBuffPhaseTick(
  roomId: string,
  expectedVersion: number,
  transitionKey: string,
): Promise<MovieBuffPhaseView> {
  const payload = await phaseRequest<{ phase: MovieBuffPhaseView }>(
    "/api/movie-buff/phase/tick",
    { roomId, expectedVersion, transitionKey },
  );
  return payload.phase;
}

export function shouldNavigateForMovieBuffPhase(
  currentPath: string,
  phase: MovieBuffSharedPhase,
): string | null {
  const target =
    phase === "round_intro" || phase === "vip_selection"
      ? "/games/movie-buff/round-intro"
      : phase === "board" || phase === "board_transition"
        ? "/games/movie-buff/board-preview"
        : phase === "clip_ready" ||
            phase === "clip_playback" ||
            phase === "answer"
          ? "/games/movie-buff/play"
          : phase === "results"
            ? "/games/movie-buff/round-results"
            : "/games/movie-buff/final-results";

  return currentPath === target ? null : target;
}
