import { supabase } from "@/lib/supabase";

export type MovieBuffMatchPhaseParticipant = {
  seatIndex: number;
  playerId: string | null;
  controllerType: string;
  participantState: string;
  reconnectDeadlineAt: string | null;
  replacementReadyAt: string | null;
  isSelector: boolean;
  score: number;
};

export type MovieBuffMatchPhaseView = {
  roomId: string;
  matchId: string;
  roundId: string | null;
  roundNumber: number;
  totalRounds: number;
  phase: string;
  phaseVersion: number;
  phaseStartedAt: string | null;
  phaseEndsAt: string | null;
  phaseRoute: string | null;
  selectorSeatIndex: number | null;
  selectorPlayerId: string | null;
  selectorControllerType: string | null;
  callerIsSelector: boolean;
  selectorDeadlineAt: string | null;
  selectedTileId: string | null;
  selectedClipId: string | null;
  selectionSource: string | null;
  playbackStartsAt: string | null;
  answerDeadlineAt: string | null;
  resultsEndAt: string | null;
  blockedReason: string | null;
  participants: MovieBuffMatchPhaseParticipant[];
  serverNow: string;
};

export type AdvanceMovieBuffMatchPhaseResult = {
  advanced: boolean;
  matchId: string;
  roundId: string | null;
  phase: string;
  phaseVersion: number;
  phaseEndsAt: string | null;
  blockedReason: string | null;
  serverNow: string;
};

export type SelectMovieBuffMatchTileResult = {
  matchId: string;
  roundId: string | null;
  phase: string;
  phaseVersion: number;
  tileId: string;
  clipId: string;
  playbackStartsAt: string | null;
  selectionSource: string | null;
};

export type MovieBuffVipInventoryItem = {
  vipId: string;
  code: string;
  name: string;
  description: string;
  activationWindow: string;
  effectScope: string;
  quantityRemaining: number;
  available: boolean;
  unavailableReason: string | null;
};

export type MovieBuffVipRoundLock = {
  lockId: string;
  vipId: string | null;
  vipName: string | null;
  lockedAt: string;
  activatedAt: string | null;
  consumedAt: string | null;
};

export type MovieBuffVipRoundView = {
  roomId: string;
  matchId: string;
  roundId: string;
  roundNumber: number;
  serverNow: string;
  deadlineAt: string | null;
  status: string;
  lockedCount: number;
  requiredPlayerCount: number;
  originalRequiredPlayerCount: number;
  advanceReady: boolean;
  inventory: MovieBuffVipInventoryItem[];
  lock: MovieBuffVipRoundLock | null;
};

export type LockMovieBuffRoundVipResult = {
  lockId: string;
  vipId: string | null;
  lockedAt: string;
  activatedAt: string | null;
  consumedAt: string | null;
};

function assertRpcJson<T>(
  data: unknown,
  message: string,
): T {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(message);
  }

  return data as T;
}

export async function getMovieBuffMatchPhaseView(
  roomId: string,
): Promise<MovieBuffMatchPhaseView> {
  const { data, error } = await supabase.rpc(
    "get_movie_buff_match_phase_view",
    {
      p_room_id: roomId,
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  return assertRpcJson<MovieBuffMatchPhaseView>(
    data,
    "The live Movie Buff phase view is unavailable.",
  );
}

export async function advanceMovieBuffMatchPhase(
  roomId: string,
  expectedVersion?: number | null,
): Promise<AdvanceMovieBuffMatchPhaseResult> {
  const args: {
    p_room_id: string;
    p_expected_version?: number | null;
  } = {
    p_room_id: roomId,
  };

  if (typeof expectedVersion === "number") {
    args.p_expected_version = expectedVersion;
  }

  const { data, error } = await supabase.rpc(
    "advance_movie_buff_match_phase",
    args,
  );

  if (error) {
    throw new Error(error.message);
  }

  return assertRpcJson<AdvanceMovieBuffMatchPhaseResult>(
    data,
    "The Movie Buff phase could not be advanced.",
  );
}

export async function selectMovieBuffMatchTile(input: {
  roomId: string;
  tileId: string;
  expectedVersion: number;
  idempotencyKey: string;
}): Promise<SelectMovieBuffMatchTileResult> {
  const { data, error } = await supabase.rpc(
    "select_movie_buff_match_tile",
    {
      p_room_id: input.roomId,
      p_tile_id: input.tileId,
      p_expected_version: input.expectedVersion,
      p_idempotency_key: input.idempotencyKey,
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  return assertRpcJson<SelectMovieBuffMatchTileResult>(
    data,
    "The board tile selection did not return a result.",
  );
}

export async function getMovieBuffVipRoundView(
  roomId: string,
  roundId: string,
): Promise<MovieBuffVipRoundView> {
  const { data, error } = await supabase.rpc(
    "get_movie_buff_vip_round_view",
    {
      p_room_id: roomId,
      p_round_id: roundId,
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  return assertRpcJson<MovieBuffVipRoundView>(
    data,
    "The Movie Buff VIP choices are unavailable.",
  );
}

export async function lockMovieBuffRoundVip(input: {
  roomId: string;
  roundId: string;
  vipId: string | null;
  idempotencyKey: string;
}): Promise<LockMovieBuffRoundVipResult> {
  const { data, error } = await supabase.rpc(
    "lock_movie_buff_round_vip",
    {
      p_room_id: input.roomId,
      p_round_id: input.roundId,
      p_vip_id: input.vipId,
      p_idempotency_key: input.idempotencyKey,
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  return assertRpcJson<LockMovieBuffRoundVipResult>(
    data,
    "The Movie Buff VIP choice could not be locked.",
  );
}

export function buildMovieBuffPhaseRouteHref(
  phaseView: Pick<
    MovieBuffMatchPhaseView,
    "phaseRoute" | "roomId" | "roundId"
  >,
  roomIdOverride?: string,
): string | null {
  const route = phaseView.phaseRoute?.trim() ?? "";
  const roomId = roomIdOverride ?? phaseView.roomId;

  if (!route || !roomId) {
    return null;
  }

  if (route === "/games/movie-buff/round-results") {
    if (!phaseView.roundId) {
      return null;
    }

    return `${route}?roomId=${encodeURIComponent(
      roomId,
    )}&roundId=${encodeURIComponent(phaseView.roundId)}`;
  }

  return `${route}?roomId=${encodeURIComponent(roomId)}`;
}
