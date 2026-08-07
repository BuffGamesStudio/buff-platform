import { supabase } from "@/lib/supabase";

export const MOVIE_BUFF_AUTHORITATIVE_SCHEMA_VERSION = 1 as const;

export type MovieBuffCanonicalPhase =
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

export type MovieBuffTransitionPresentation = "curtain" | "film_slate";

export type MovieBuffPhaseParticipant = {
  seatIndex: number;
  playerId: string;
  controllerType: "human" | "buster";
  participantState: "active" | "reconnect_grace" | "abandoned" | "completed";
  reconnectDeadlineAt: string | null;
  isSelector: boolean;
  score: number;
};

export type MovieBuffAuthoritativePhaseView = {
  schemaVersion: typeof MOVIE_BUFF_AUTHORITATIVE_SCHEMA_VERSION;
  sourceSha: string;
  buildIdentity: string;
  transitionPresentation: MovieBuffTransitionPresentation | null;
  roomId: string;
  matchId: string;
  roundId: string;
  roundNumber: number;
  totalRounds: number;
  phase: MovieBuffCanonicalPhase;
  phaseVersion: number;
  phaseStartedAt: string;
  phaseEndsAt: string | null;
  phaseRoute: string;
  selectorSeatIndex: number | null;
  selectorPlayerId: string | null;
  selectorControllerType: "human" | "buster" | null;
  callerIsSelector: boolean;
  selectorDeadlineAt: string | null;
  selectedTileId: string | null;
  selectedClipId: string | null;
  selectionSource: "human" | "timeout" | "buster_timeout" | "system" | null;
  playbackStartsAt: string | null;
  answerDeadlineAt: string | null;
  resultsEndAt: string | null;
  blockedReason: string | null;
  participants: MovieBuffPhaseParticipant[];
  serverNow: string;
};

export type MovieBuffActiveLeaveQuote = {
  quoteToken: string;
  matchId: string;
  roomId: string;
  roundId: string;
  seatIndex: number;
  phase: MovieBuffCanonicalPhase;
  phaseVersion: number;
  policyVersion: string;
  penaltyPoints: number;
  expiresAt: string;
  serverNow: string;
};

export type MovieBuffActiveLeaveResult = {
  confirmed: true;
  quoteToken: string;
  matchId: string;
  roomId: string;
  seatIndex: number;
  participantState: "abandoned";
  controllerType: "human" | "buster";
  policyVersion: string;
  penaltyPoints: number;
  scoreBefore: number;
  scoreAfter: number;
  ledgerId: string;
  phase: MovieBuffCanonicalPhase;
  phaseVersion: number;
  serverNow: string;
};

async function postAuthoritativePhase<T>(
  pathname: string,
  body: Record<string, unknown>,
): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token || session.user.is_anonymous === true) {
    throw new Error("SIGN_IN_REQUIRED");
  }

  const response = await fetch(pathname, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;

  if (!response.ok) {
    throw new Error(payload?.error ?? "Movie Buff phase action failed.");
  }

  return payload as T;
}

export async function getMovieBuffAuthoritativePhase(roomId: string) {
  const response = await postAuthoritativePhase<{
    view: MovieBuffAuthoritativePhaseView;
  }>("/api/movie-buff/match/view", { roomId });

  if (
    response.view.schemaVersion !== MOVIE_BUFF_AUTHORITATIVE_SCHEMA_VERSION ||
    !/^[0-9a-f]{40}$/i.test(response.view.sourceSha) ||
    response.view.buildIdentity !== response.view.sourceSha ||
    (response.view.phase === "transition" &&
      response.view.transitionPresentation === null) ||
    (response.view.phase !== "transition" &&
      response.view.transitionPresentation !== null)
  ) {
    throw new Error("INVALID_MOVIE_BUFF_AUTHORITATIVE_VIEW_IDENTITY");
  }

  return response.view;
}

export async function advanceMovieBuffAuthoritativePhase(
  roomId: string,
  expectedVersion: number | null = null,
) {
  const response = await postAuthoritativePhase<{
    result: {
      advanced: boolean;
      reason?: string;
      matchId?: string;
      roundId?: string;
      phase: MovieBuffCanonicalPhase;
      phaseVersion: number;
      phaseEndsAt?: string | null;
      blockedReason?: string | null;
      serverNow?: string;
    };
  }>("/api/movie-buff/match/advance", {
    roomId,
    expectedVersion,
  });
  return response.result;
}

export async function selectMovieBuffAuthoritativeTile(
  roomId: string,
  tileId: string,
  expectedVersion: number,
  idempotencyKey = `phase-tile-${crypto.randomUUID()}`,
) {
  const response = await postAuthoritativePhase<{
    selection: {
      matchId: string;
      roundId: string;
      phase: "transition";
      phaseVersion: number;
      tileId: string;
      clipId: string;
      playbackStartsAt: string;
      selectionSource: "human";
    };
  }>("/api/movie-buff/match/select", {
    roomId,
    tileId,
    expectedVersion,
    idempotencyKey,
  });
  return response.selection;
}

export async function getMovieBuffActiveLeaveQuote(roomId: string) {
  const response = await postAuthoritativePhase<{
    quote: MovieBuffActiveLeaveQuote;
  }>("/api/movie-buff/match/leave/quote", { roomId });
  return response.quote;
}

export async function confirmMovieBuffActiveLeave(
  quoteToken: string,
  idempotencyKey: string,
) {
  const response = await postAuthoritativePhase<{
    result: MovieBuffActiveLeaveResult;
  }>("/api/movie-buff/match/leave/confirm", {
    quoteToken,
    idempotencyKey,
  });
  return response.result;
}
