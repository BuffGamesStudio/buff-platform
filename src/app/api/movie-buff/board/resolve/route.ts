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
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Board resolution failed.",
      },
      { status: 500 },
    );
  }
}
