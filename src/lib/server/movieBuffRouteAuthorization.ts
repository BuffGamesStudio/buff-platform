import "server-only";

import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

export class MovieBuffAuthorizationError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403,
  ) {
    super(message);
    this.name = "MovieBuffAuthorizationError";
  }
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const [scheme, token, ...extra] = authorization.split(/\s+/);

  if (scheme?.toLowerCase() !== "bearer" || !token || extra.length > 0) {
    throw new MovieBuffAuthorizationError("Authentication required.", 401);
  }

  return token;
}

export async function requireActiveMovieBuffRoomMember(
  request: Request,
  roomId: string,
) {
  const accessToken = getBearerToken(request);
  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(accessToken);

  if (userError || !user) {
    throw new MovieBuffAuthorizationError("Authentication required.", 401);
  }

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from("room_players")
    .select("player_id, is_host")
    .eq("room_id", roomId)
    .eq("player_id", user.id)
    .is("left_at", null)
    .maybeSingle();

  if (membershipError) {
    throw new Error("Unable to verify room membership.");
  }

  if (!membership) {
    throw new MovieBuffAuthorizationError("Room access denied.", 403);
  }

  return {
    userId: user.id,
    playerId: membership.player_id as string,
    isHost: Boolean(membership.is_host),
  };
}
