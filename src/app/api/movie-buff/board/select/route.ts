import { NextResponse } from "next/server";

import { selectMovieBuffBoardTile } from "@/lib/server/movieBuffBoard";
import { canSelectMovieBuffBoardTile } from "@/lib/server/movieBuffBoardRoutePolicy";
import {
  MovieBuffAuthorizationError,
  requireActiveMovieBuffRoomMember,
} from "@/lib/server/movieBuffRouteAuthorization";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      roomId?: string;
      tileId?: string;
    };
    const roomId = body.roomId?.trim() ?? "";
    const tileId = body.tileId?.trim() ?? "";

    if (!roomId || !tileId) {
      return NextResponse.json(
        { error: "roomId and tileId are required." },
        { status: 400 },
      );
    }

    const actor = await requireActiveMovieBuffRoomMember(request, roomId);
    const { data: board, error: boardError } = await supabaseAdmin
      .from("movie_buff_boards")
      .select("id, selector_player_id")
      .eq("room_id", roomId)
      .maybeSingle();

    if (boardError) {
      throw new Error("Unable to verify board authority.");
    }

    const { data: tile, error: tileError } = board
      ? await supabaseAdmin
          .from("movie_buff_board_tiles")
          .select("id")
          .eq("id", tileId)
          .eq("board_id", board.id)
          .maybeSingle()
      : { data: null, error: null };

    if (tileError) {
      throw new Error("Unable to verify board tile.");
    }

    if (
      !board ||
      !canSelectMovieBuffBoardTile({
        actorPlayerId: actor.playerId,
        selectorPlayerId: board.selector_player_id as string | null,
        tileBelongsToBoard: Boolean(tile),
      })
    ) {
      throw new MovieBuffAuthorizationError("Room access denied.", 403);
    }

    const result = await selectMovieBuffBoardTile({ roomId, tileId });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof MovieBuffAuthorizationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Board selection failed.",
      },
      { status: 500 },
    );
  }
}
