import "server-only";

import { createClient } from "@supabase/supabase-js";

import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export class MovieBuffPhaseRouteError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 401 | 403 | 404 | 409 | 500,
  ) {
    super(message);
    this.name = "MovieBuffPhaseRouteError";
  }
}

export function parseMovieBuffPhaseBearerToken(header: string | null) {
  const match = header?.match(/^Bearer\s+([^\s]+)$/i);
  return match?.[1] ?? null;
}

export function isMovieBuffPhaseUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

export function normalizeMovieBuffPhaseActionKey(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length >= 8 && normalized.length <= 128
    ? normalized
    : null;
}

export async function requireMovieBuffPhaseCaller(request: Request) {
  const accessToken = parseMovieBuffPhaseBearerToken(
    request.headers.get("authorization"),
  );

  if (!accessToken) {
    throw new MovieBuffPhaseRouteError("Authentication required.", 401);
  }

  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(accessToken);

  if (userError || !user || user.is_anonymous === true) {
    throw new MovieBuffPhaseRouteError("Authentication required.", 401);
  }

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new MovieBuffPhaseRouteError(
      "Movie Buff caller client is unavailable.",
      500,
    );
  }

  const caller = createClient(supabaseUrl, supabasePublishableKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return {
    userId: user.id,
    accessToken,
    caller,
  };
}

export async function requireMovieBuffPhaseMember(
  request: Request,
  roomId: string,
) {
  const authenticated = await requireMovieBuffPhaseCaller(request);

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from("room_players")
    .select("player_id, left_at")
    .eq("room_id", roomId)
    .eq("player_id", authenticated.userId)
    .maybeSingle();

  if (membershipError) {
    throw new MovieBuffPhaseRouteError(
      "Unable to verify Movie Buff membership.",
      500,
    );
  }

  if (!membership || membership.left_at !== null) {
    throw new MovieBuffPhaseRouteError("Room access denied.", 403);
  }

  return authenticated;
}

export function movieBuffPhaseErrorResponse(error: unknown) {
  const status =
    error instanceof MovieBuffPhaseRouteError ? error.status : 400;
  const message =
    error instanceof Error ? error.message : "Movie Buff phase action failed.";

  return Response.json({ error: message }, { status });
}
