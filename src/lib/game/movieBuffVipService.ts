import {
  isMovieBuffVipCanonicalPhase,
  type MovieBuffVipCanonicalPhaseView,
} from "@/lib/game/movieBuffVipPhasePolicy";
import { supabase } from "@/lib/supabase";

export type MovieBuffVipInventoryItem = {
  vipId: string;
  code: string;
  name: string;
  description: string;
  activationWindow: "round_intro" | "board_select" | "playback" | "answer" | "results";
  effectScope: "personal" | "shared";
  quantityRemaining: number;
  available: boolean;
  unavailableReason: string | null;
};

export type MovieBuffVipLock = {
  lockId: string;
  vipId: string | null;
  vipName: string | null;
  lockedAt: string;
  activatedAt: string | null;
  consumedAt: string | null;
};

export type MovieBuffVipRoundView = {
  roomId: string;
  matchId: string | null;
  roundId: string;
  roundNumber: number | null;
  serverNow: string;
  deadlineAt: string | null;
  status: "open" | "closed" | "unavailable";
  lockedCount: number;
  requiredPlayerCount: number;
  originalRequiredPlayerCount: number;
  advanceReady: boolean;
  inventory: MovieBuffVipInventoryItem[];
  lock: MovieBuffVipLock | null;
};

async function requireVipAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token || session.user.is_anonymous === true) {
    throw new Error("SIGN_IN_REQUIRED");
  }

  return session.access_token;
}

async function postVip<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const accessToken = await requireVipAccessToken();
  const response = await fetch(path, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;

  if (!response.ok) {
    throw new Error(payload?.error ?? "VIP action failed.");
  }

  return payload as T;
}

export async function getMovieBuffVipRoundView(roomId: string, roundId: string) {
  const result = await postVip<{ view: MovieBuffVipRoundView }>(
    "/api/movie-buff/vip/view",
    { roomId, roundId },
  );
  return result.view;
}

export async function getMovieBuffVipCanonicalPhaseView(
  roomId: string,
): Promise<MovieBuffVipCanonicalPhaseView | null> {
  const accessToken = await requireVipAccessToken();
  const response = await fetch("/api/movie-buff/match/view", {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ roomId }),
  });

  // PR #6 can be reviewed independently before MOV-17 is integrated. A missing
  // route means "wait here", never permission to navigate from VIP readiness.
  if (response.status === 404) {
    return null;
  }

  const payload = (await response.json().catch(() => null)) as
    | {
        view?: {
          roomId?: unknown;
          roundId?: unknown;
          roundNumber?: unknown;
          phase?: unknown;
          phaseVersion?: unknown;
          phaseRoute?: unknown;
        };
        error?: string;
      }
    | null;

  if (!response.ok || !payload?.view) {
    throw new Error(payload?.error ?? "Authoritative phase view is unavailable.");
  }

  const view = payload.view;
  if (
    view.roomId !== roomId ||
    typeof view.roundId !== "string" ||
    !Number.isInteger(view.roundNumber) ||
    !isMovieBuffVipCanonicalPhase(view.phase) ||
    !Number.isInteger(view.phaseVersion) ||
    (view.phaseRoute !== null && typeof view.phaseRoute !== "string")
  ) {
    throw new Error("Authoritative phase view is invalid.");
  }

  return {
    roomId: view.roomId,
    roundId: view.roundId,
    roundNumber: view.roundNumber as number,
    phase: view.phase,
    phaseVersion: view.phaseVersion as number,
    phaseRoute: view.phaseRoute as string | null,
  };
}

export async function lockMovieBuffRoundVip(
  roomId: string,
  roundId: string,
  vipId: string | null,
  idempotencyKey: string,
) {
  const result = await postVip<{ lock: MovieBuffVipLock }>(
    "/api/movie-buff/vip/lock",
    { roomId, roundId, vipId, idempotencyKey },
  );
  return result.lock;
}

export async function activateMovieBuffRoundVip(
  roomId: string,
  roundId: string,
  activationKey: string,
) {
  return postVip<{ activation: MovieBuffVipLock }>(
    "/api/movie-buff/vip/activate",
    { roomId, roundId, activationKey },
  );
}
