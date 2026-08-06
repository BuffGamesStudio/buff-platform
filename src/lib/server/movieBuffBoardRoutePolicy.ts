export type MovieBuffRoomMembership = {
  player_id: string;
  is_host: boolean;
  left_at?: string | null;
} | null;

export function parseBearerToken(authorization: string | null) {
  const value = authorization?.trim() ?? "";
  const [scheme, token, ...extra] = value.split(/\s+/);

  if (scheme?.toLowerCase() !== "bearer" || !token || extra.length > 0) {
    return null;
  }

  return token;
}

export function isActiveMovieBuffMembership(
  membership: MovieBuffRoomMembership,
): membership is NonNullable<MovieBuffRoomMembership> {
  return Boolean(membership && membership.left_at == null);
}

export function canEnsureMovieBuffBoard(input: {
  boardExists: boolean;
  isHost: boolean;
}) {
  return input.boardExists || input.isHost;
}

export function canSelectMovieBuffBoardTile(input: {
  actorPlayerId: string;
  selectorPlayerId: string | null;
  tileBelongsToBoard: boolean;
}) {
  return (
    input.tileBelongsToBoard &&
    input.selectorPlayerId !== null &&
    input.selectorPlayerId === input.actorPlayerId
  );
}
