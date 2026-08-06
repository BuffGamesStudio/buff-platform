import { supabase } from "@/lib/supabase";

export type MovieBuffSharedPhase =
  | "round_intro"
  | "vip_lock"
  | "board_select"
  | "transition"
  | "playback"
  | "answer"
  | "results"
  | "finished"
  | "abandoned"
  | "blocked";

export type MovieBuffControllerKind = "human" | "buster";

export type MovieBuffParticipationState =
  | "active"
  | "reconnect_grace"
  | "abandoned"
  | "completed";

export type MovieBuffCanonicalRoute =
  | "/games/movie-buff/round-intro"
  | "/games/movie-buff/board-preview"
  | "/games/movie-buff/play"
  | "/games/movie-buff/round-results"
  | "/games/movie-buff/final-results"
  | "/games/movie-buff/match-status";

export type MovieBuffPhaseView = {
  roomId: string;
  matchId: string;
  roundId: string | null;
  roundNumber: number;
  phase: MovieBuffSharedPhase;
  phaseVersion: number;
  phaseStartedAt: string;
  phaseEndsAt: string | null;
  selectorSeatId: string | null;
  selectorDeadlineAt: string | null;
  selectedTileId: string | null;
  selectedClipId: string | null;
  playbackStartsAt: string | null;
  playbackEndsAt: string | null;
  answerDeadlineAt: string | null;
  resultsEndAt: string | null;
  serverNow: string;
  canonicalRoute: MovieBuffCanonicalRoute;
  terminalReason: string | null;
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

export async function getMovieBuffMatchView(
  matchId: string,
): Promise<MovieBuffPhaseView> {
  const payload = await phaseRequest<{ match: MovieBuffPhaseView }>(
    "/api/movie-buff/match/view",
    { matchId },
  );
  return payload.match;
}

export async function requestMovieBuffPhaseAdvance(
  matchId: string,
  expectedPhaseVersion: number,
  idempotencyKey: string,
): Promise<MovieBuffPhaseView> {
  const payload = await phaseRequest<{ match: MovieBuffPhaseView }>(
    "/api/movie-buff/match/advance",
    { matchId, expectedPhaseVersion, idempotencyKey },
  );
  return payload.match;
}

export function getMovieBuffCanonicalRoute(
  phase: MovieBuffSharedPhase,
): MovieBuffCanonicalRoute {
  if (phase === "round_intro" || phase === "vip_lock") {
    return "/games/movie-buff/round-intro";
  }

  if (phase === "board_select") {
    return "/games/movie-buff/board-preview";
  }

  if (phase === "transition" || phase === "playback" || phase === "answer") {
    return "/games/movie-buff/play";
  }

  if (phase === "results") {
    return "/games/movie-buff/round-results";
  }

  if (phase === "finished") {
    return "/games/movie-buff/final-results";
  }

  return "/games/movie-buff/match-status";
}

export function shouldNavigateForMovieBuffPhase(
  currentPath: string,
  phase: MovieBuffSharedPhase,
): MovieBuffCanonicalRoute | null {
  const target = getMovieBuffCanonicalRoute(phase);
  return currentPath === target ? null : target;
}
