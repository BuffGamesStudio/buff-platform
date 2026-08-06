import "server-only";

import { ensureMovieBuffBoardForRoomRaceSafe } from "@/lib/server/movieBuffBoardRaceSafe";
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

    // Board creation/loading is allowed only after verified active membership.
    // The authenticated match-view response is the only normal browser source
    // for both canonical phase state and the persisted rich board preview.
    const board = await ensureMovieBuffBoardForRoomRaceSafe(body.roomId);

    const { data, error } = await caller.rpc(
      "get_movie_buff_match_phase_view",
      { p_room_id: body.roomId },
    );

    if (error) {
      throw new MovieBuffPhaseRouteError(error.message, 409);
    }

    return Response.json(
      {
        view: data,
        board: {
          boardId: board.boardId,
          preview: board.preview,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    return movieBuffPhaseErrorResponse(error);
  }
}
