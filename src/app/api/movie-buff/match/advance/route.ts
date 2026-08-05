import "server-only";

import {
  isMovieBuffPhaseUuid,
  movieBuffPhaseErrorResponse,
  MovieBuffPhaseRouteError,
  requireMovieBuffPhaseMember,
} from "@/lib/server/movieBuffPhaseRouteAuthorization";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as
      | { roomId?: unknown; expectedVersion?: unknown }
      | null;

    if (!isMovieBuffPhaseUuid(body?.roomId)) {
      throw new MovieBuffPhaseRouteError("Valid roomId required.", 400);
    }

    const expectedVersion = body?.expectedVersion;
    if (
      expectedVersion !== null &&
      expectedVersion !== undefined &&
      (!Number.isSafeInteger(expectedVersion) || Number(expectedVersion) <= 0)
    ) {
      throw new MovieBuffPhaseRouteError(
        "expectedVersion must be a positive integer or null.",
        400,
      );
    }

    const { caller } = await requireMovieBuffPhaseMember(
      request,
      body.roomId,
    );

    const { data, error } = await caller.rpc(
      "advance_movie_buff_match_phase",
      {
        p_room_id: body.roomId,
        p_expected_version:
          expectedVersion === null || expectedVersion === undefined
            ? null
            : Number(expectedVersion),
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
