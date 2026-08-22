import { NextResponse } from "next/server";

import { getMovieBuffBroadcastProjection } from "@/lib/movie-buff-live/broadcastProjection";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function noStoreHeaders(): HeadersInit {
  return {
    "cache-control": "no-store, max-age=0",
  };
}

export async function GET(request: Request) {
  const showKey = new URL(request.url).searchParams.get("showKey") ?? "main";

  try {
    const projection = await getMovieBuffBroadcastProjection(showKey);

    return NextResponse.json(projection, {
      headers: noStoreHeaders(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Broadcast state unavailable.";
    const isInvalidShowKey = message === "Invalid Movie Buff Live show key.";

    return NextResponse.json(
      {
        error: isInvalidShowKey
          ? message
          : "Movie Buff Live broadcast state is temporarily unavailable.",
      },
      {
        status: isInvalidShowKey ? 400 : 503,
        headers: noStoreHeaders(),
      },
    );
  }
}
