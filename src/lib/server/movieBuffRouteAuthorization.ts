import "server-only";

import {
  isActiveMovieBuffMembership,
  parseBearerToken,
} from "@/lib/server/movieBuffBoardRoutePolicy";
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

export async function requireActiveMovieBuffRoomMember(
  request: Request,
  roomId: string,
) {
  const accessToken = parseBearerToken(request.headers.get("authorization"));

  if (!accessToken) {
    throw new MovieBuffAuthorizationError("Authentication required.", 401);
  }

  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(accessToken);

  if (userError || !user || user.is_anonymous === true) {
    throw new MovieBuffAuthorizationError("Authentication required.", 401);
  }

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from("room_players")
    .select("player_id, is_host, left_at")
    .eq("room_id", roomId)
    .eq("player_id", user.id)
    .maybeSingle();

  if (membershipError) {
    throw new Error("Unable to verify room membership.");
  }

  if (!isActiveMovieBuffMembership(membership)) {
    throw new MovieBuffAuthorizationError("Room access denied.", 403);
  }

  return {
    userId: user.id,
    playerId: membership.player_id as string,
    isHost: Boolean(membership.is_host),
  };
}
