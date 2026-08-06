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
      | {
          roomId?: unknown;
          quoteToken?: unknown;
          idempotencyKey?: unknown;
        }
      | null;

    if (!isMovieBuffPhaseUuid(body?.roomId)) {
      throw new MovieBuffPhaseRouteError("Valid roomId required.", 400);
    }
    if (
      typeof body?.quoteToken !== "string" ||
      body.quoteToken.trim().length < 8 ||
      body.quoteToken.trim().length > 256
    ) {
      throw new MovieBuffPhaseRouteError("Valid quoteToken required.", 400);
    }

    const idempotencyKey = normalizeMovieBuffPhaseActionKey(
      body?.idempotencyKey,
    );
    if (!idempotencyKey) {
      throw new MovieBuffPhaseRouteError(
        "Valid idempotencyKey required.",
        400,
      );
    }

    // Authentication only: an identical retry must remain replayable after the
    // first successful confirmation has atomically closed room membership.
    const { caller } = await requireMovieBuffPhaseCaller(request);

    const { data, error } = await caller.rpc(
      "confirm_movie_buff_active_leave",
      {
        p_room_id: body.roomId,
        p_quote_token: body.quoteToken.trim(),
        p_idempotency_key: idempotencyKey,
      },
    );

    if (error) {
      throw new MovieBuffPhaseRouteError(error.message, 409);
    }

    return Response.json({ confirmation: data }, { status: 200 });
  } catch (error) {
    return movieBuffPhaseErrorResponse(error);
  }
}
