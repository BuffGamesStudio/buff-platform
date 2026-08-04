import { NextResponse } from "next/server";

import { ensureMovieBuffBoardForRoom } from "@/lib/server/movieBuffBoard";
import { canEnsureMovieBuffBoard } from "@/lib/server/movieBuffBoardRoutePolicy";
import {
  MovieBuffAuthorizationError,
  requireActiveMovieBuffRoomMember,
} from "@/lib/server/movieBuffRouteAuthorization";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { roomId?: string };
    const roomId = body.roomId?.trim() ?? "";

    if (!roomId) {
      return NextResponse.json(
        { error: "roomId is required." },
        { status: 400 },
      );
    }

    const actor = await requireActiveMovieBuffRoomMember(request, roomId);
    const { data: existingBoard, error: boardLookupError } = await supabaseAdmin
      .from("movie_buff_boards")
      .select("id")
      .eq("room_id", roomId)
      .maybeSingle();

    if (boardLookupError) {
      throw new Error("Unable to verify board state.");
    }

    if (
      !canEnsureMovieBuffBoard({
        boardExists: Boolean(existingBoard),
        isHost: actor.isHost,
      })
    ) {
      throw new MovieBuffAuthorizationError("Room access denied.", 403);
    }

    const result = await ensureMovieBuffBoardForRoom(roomId);
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
            : "Board preparation failed.",
      },
      { status: 500 },
    );
  }
}
