import { NextResponse } from "next/server";

import { resolveMovieBuffBoardAfterRound } from "@/lib/server/movieBuffBoard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      roomId?: string;
    };
    const roomId = body.roomId?.trim() ?? "";

    if (!roomId) {
      return NextResponse.json(
        { error: "roomId is required." },
        { status: 400 },
      );
    }

    const result = await resolveMovieBuffBoardAfterRound({
      roomId,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Board resolution failed.";

    const normalizedMessage =
      message.toLowerCase();

    const canFallbackToLinearFlow =
      normalizedMessage.includes(
        "movie_buff_boards"
      ) ||
      normalizedMessage.includes(
        "movie_buff_board_"
      ) ||
      normalizedMessage.includes(
        "schema cache"
      ) ||
      normalizedMessage.includes(
        "relation \"public.content_items\" does not exist"
      ) ||
      normalizedMessage.includes(
        "relation \"public.content_media\" does not exist"
      );

    if (canFallbackToLinearFlow) {
      return NextResponse.json(
        {
          boardResolved: false,
          boardUnavailable: true,
          boardId: null,
          nextSelectorPlayerId: null,
          status: null,
          tileId: null,
          tilesUsedCount: 0,
        },
        { status: 200 },
      );
    }

    return NextResponse.json(
      {
        error: message,
      },
      { status: 500 },
    );
  }
}
