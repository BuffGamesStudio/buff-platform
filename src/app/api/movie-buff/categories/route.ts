import { NextResponse } from "next/server";

import { listMovieBuffLobbyCategories } from "@/lib/server/movieBuffLobby";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const categories =
      await listMovieBuffLobbyCategories();

    return NextResponse.json({ categories });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The Movie Buff categories could not be loaded.",
      },
      { status: 500 },
    );
  }
}
