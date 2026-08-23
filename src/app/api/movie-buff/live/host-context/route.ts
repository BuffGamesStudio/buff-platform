import { NextResponse } from "next/server";

import { getMovieBuffBroadcastProjection } from "@/lib/movie-buff-live/broadcastProjection";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function noStoreHeaders(): HeadersInit {
  return {
    "cache-control": "no-store, max-age=0",
  };
}

/**
 * Read-only, secret-free context for the Cinephile Cinematic LiveKit agent.
 * Keep this payload smaller than the full broadcast composition and never
 * include provider credentials or raw clip identifiers.
 */
export async function GET(request: Request) {
  const showKey = new URL(request.url).searchParams.get("showKey") ?? "main";

  try {
    const projection = await getMovieBuffBroadcastProjection(showKey);

    return NextResponse.json(
      {
        schemaVersion: projection.schemaVersion,
        generatedAt: projection.generatedAt,
        showKey: projection.showKey,
        host: projection.host,
        show: {
          status: projection.show.status,
          episodeNumber: projection.show.episodeNumber,
          currentPhase: projection.show.currentPhase,
          currentPhaseEndsAt: projection.show.currentPhaseEndsAt,
          currentRoundNumber: projection.show.currentRoundNumber,
          totalRounds: projection.show.totalRounds,
          queueCount: projection.show.queueCount,
          queueCapacity: projection.show.queueCapacity,
          contestants: projection.show.contestants,
          serverNow: projection.show.serverNow,
        },
        media: projection.media,
      },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Host context unavailable.";
    const isInvalidShowKey = message === "Invalid Movie Buff Live show key.";

    return NextResponse.json(
      {
        error: isInvalidShowKey
          ? message
          : "Movie Buff Live host context is temporarily unavailable.",
      },
      {
        status: isInvalidShowKey ? 400 : 503,
        headers: noStoreHeaders(),
      },
    );
  }
}
