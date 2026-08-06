import "server-only";

import {
  isMovieBuffPhaseUuid,
  movieBuffPhaseErrorResponse,
  MovieBuffPhaseRouteError,
  normalizeMovieBuffPhaseActionKey,
  requireMovieBuffPhaseMember,
} from "@/lib/server/movieBuffPhaseRouteAuthorization";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as
      | {
          roomId?: unknown;
          tileId?: unknown;
          expectedVersion?: unknown;
          idempotencyKey?: unknown;
        }
      | null;

    if (!isMovieBuffPhaseUuid(body?.roomId)) {
      throw new MovieBuffPhaseRouteError("Valid roomId required.", 400);
    }
    if (!isMovieBuffPhaseUuid(body?.tileId)) {
      throw new MovieBuffPhaseRouteError("Valid tileId required.", 400);
    }
    if (
      !Number.isSafeInteger(body?.expectedVersion) ||
      Number(body?.expectedVersion) <= 0
    ) {
      throw new MovieBuffPhaseRouteError(
        "A positive expectedVersion is required.",
        400,
      );
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

    const { caller } = await requireMovieBuffPhaseMember(
      request,
      body.roomId,
    );

    const { data, error } = await caller.rpc(
      "select_movie_buff_match_tile",
      {
        p_room_id: body.roomId,
        p_tile_id: body.tileId,
        p_expected_version: Number(body.expectedVersion),
        p_idempotency_key: idempotencyKey,
      },
    );

    if (error) {
      throw new MovieBuffPhaseRouteError(error.message, 409);
    }

    return Response.json({ selection: data }, { status: 200 });
  } catch (error) {
    return movieBuffPhaseErrorResponse(error);
  }
}
