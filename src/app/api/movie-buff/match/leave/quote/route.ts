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
      | { roomId?: unknown }
      | null;

    if (!isMovieBuffPhaseUuid(body?.roomId)) {
      throw new MovieBuffPhaseRouteError("Valid roomId required.", 400);
    }

    const { caller } = await requireMovieBuffPhaseMember(
      request,
      body.roomId,
    );

    const { data, error } = await caller.rpc(
      "get_movie_buff_active_leave_quote",
      { p_room_id: body.roomId },
    );

    if (error) {
      throw new MovieBuffPhaseRouteError(error.message, 409);
    }

    return Response.json({ quote: data }, { status: 200 });
  } catch (error) {
    return movieBuffPhaseErrorResponse(error);
  }
}
