export const MOVIE_BUFF_VIP_IDEMPOTENCY_KEY_MAX_LENGTH = 128;

export function parseMovieBuffVipBearerToken(value: string | null) {
  if (!value) {
    return null;
  }

  const match = value.match(/^Bearer\s+([^\s]+)$/i);
  return match?.[1]?.trim() || null;
}

export function isMovieBuffVipUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

export function normalizeMovieBuffVipIdempotencyKey(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (
    normalized.length < 8 ||
    normalized.length > MOVIE_BUFF_VIP_IDEMPOTENCY_KEY_MAX_LENGTH
  ) {
    return null;
  }

  return normalized;
}

export function isSameMovieBuffVipSelection(
  existingVipId: string | null,
  requestedVipId: string | null,
) {
  return existingVipId === requestedVipId;
}

export function isMovieBuffVipDeadlineExpired(
  serverNow: string | Date,
  deadlineAt: string | Date | null,
) {
  if (!deadlineAt) {
    return true;
  }

  const nowMs = new Date(serverNow).getTime();
  const deadlineMs = new Date(deadlineAt).getTime();
  return !Number.isFinite(nowMs) || !Number.isFinite(deadlineMs) || nowMs >= deadlineMs;
}

export function getMovieBuffVipRemainingSeconds(
  serverNow: string | Date,
  deadlineAt: string | Date | null,
) {
  if (!deadlineAt) {
    return 0;
  }

  const milliseconds =
    new Date(deadlineAt).getTime() - new Date(serverNow).getTime();

  if (!Number.isFinite(milliseconds)) {
    return 0;
  }

  return Math.max(0, Math.ceil(milliseconds / 1000));
}

export function shouldAdvanceMovieBuffVipWindow({
  status,
  lockedCount,
  requiredPlayerCount,
  deadlineExpired,
}: {
  status: string;
  lockedCount: number;
  requiredPlayerCount: number;
  deadlineExpired: boolean;
}) {
  return (
    status !== "unavailable" &&
    (deadlineExpired ||
      (requiredPlayerCount > 0 && lockedCount >= requiredPlayerCount))
  );
}
