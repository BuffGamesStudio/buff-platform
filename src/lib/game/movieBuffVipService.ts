import { supabase } from "@/lib/supabase";

export type MovieBuffVipInventoryItem = {
  vipId: string;
  code: string;
  name: string;
  description: string;
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
  advanceReady: boolean;
  inventory: MovieBuffVipInventoryItem[];
  lock: MovieBuffVipLock | null;
};

async function postVip<T>(path: string, body: Record<string, unknown>): Promise<T> {
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
      Authorization: `Bearer ${session.access_token}`,
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
