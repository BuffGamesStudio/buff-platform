import "server-only";

import { createClient } from "@supabase/supabase-js";

import { parseMovieBuffVipBearerToken } from "@/lib/server/movieBuffVipRoutePolicy";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

export class MovieBuffVipAuthorizationError extends Error {
  constructor(message: string, readonly status: 401 | 403) {
    super(message);
    this.name = "MovieBuffVipAuthorizationError";
  }
}

export async function requireMovieBuffVipCaller(request: Request) {
  const accessToken = parseMovieBuffVipBearerToken(
    request.headers.get("authorization"),
  );

  if (!accessToken) {
    throw new MovieBuffVipAuthorizationError("Authentication required.", 401);
  }

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(accessToken);

  if (error || !user || user.is_anonymous === true) {
    throw new MovieBuffVipAuthorizationError("Authentication required.", 401);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Movie Buff VIP authorization is not configured.");
  }

  return {
    userId: user.id,
    client: createClient(url, key, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    }),
  };
}
