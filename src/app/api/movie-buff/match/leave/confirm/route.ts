import "server-only";

import {
  isMovieBuffPhaseUuid,
  movieBuffPhaseErrorResponse,
  MovieBuffPhaseRouteError,
  normalizeMovieBuffPhaseActionKey,
  requireMovieBuffPhaseCaller,
} from "@/lib/server/movieBuffPhaseRouteAuthorization";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as
      | { quoteToken?: unknown; idempotencyKey?: unknown }
      | null;

    if (!isMovieBuffPhaseUuid(body?.quoteToken)) {
      throw new MovieBuffPhaseRouteError(
        "Valid active-leave quoteToken required.",
        400,
      );
    }

    const idempotencyKey = normalizeMovieBuffPhaseActionKey(
      body?.idempotencyKey,
    );
    if (!idempotencyKey) {
      throw new MovieBuffPhaseRouteError(
        "Valid active-leave idempotencyKey required.",
        400,
      );
    }

    // Confirmation retries must remain idempotent after the first successful
    // transaction marks room membership left. The database quote binds caller,
    // room, match, seat, phase version, policy, and expiry.
    const { caller } = await requireMovieBuffPhaseCaller(request);

    const { data, error } = await caller.rpc(
      "confirm_movie_buff_active_leave",
      {
        p_quote_token: body.quoteToken,
        p_idempotency_key: idempotencyKey,
      },
    );

    if (error) {
      throw new MovieBuffPhaseRouteError(error.message, 409);
    }

    return Response.json({ result: data }, { status: 200 });
  } catch (error) {
    return movieBuffPhaseErrorResponse(error);
  }
}
