import "server-only";

import { ensureReconciledMovieBuffBoardForRoom } from "@/lib/server/movieBuffBoardInitialization";
import {
  isMovieBuffPhaseUuid,
  movieBuffPhaseErrorResponse,
  MovieBuffPhaseRouteError,
  requireMovieBuffPhaseMember,
} from "@/lib/server/movieBuffPhaseRouteAuthorization";

export const dynamic = "force-dynamic";

const MOVIE_BUFF_AUTHORITATIVE_SCHEMA_VERSION = 1 as const;
const MOVIE_BUFF_SHA_PATTERN = /^[0-9a-f]{40}$/i;

function requireMovieBuffSourceSha() {
  const sourceSha =
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.GITHUB_SHA ??
    process.env.NEXT_PUBLIC_MOVIE_BUFF_SOURCE_SHA ??
    "";

  if (!MOVIE_BUFF_SHA_PATTERN.test(sourceSha)) {
    throw new MovieBuffPhaseRouteError(
      "Immutable Movie Buff source identity is unavailable.",
      503,
    );
  }

  return sourceSha.toLowerCase();
}

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
    const sourceSha = requireMovieBuffSourceSha();

    // Board creation/loading is allowed only after verified active membership.
    // Concurrent clients share one local initialization promise. Cross-instance
    // unique-key races are reconciled by retrying until the persisted board has
    // complete categories and tiles, so no client receives a partial board.
    const board = await ensureReconciledMovieBuffBoardForRoom(body.roomId);

    const { data, error } = await caller.rpc(
      "get_movie_buff_match_phase_view",
      { p_room_id: body.roomId },
    );

    if (error) {
      throw new MovieBuffPhaseRouteError(error.message, 409);
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new MovieBuffPhaseRouteError(
        "Canonical Movie Buff phase view is unavailable.",
        409,
      );
    }

    const phase = (data as { phase?: unknown }).phase;
    const transitionPresentation =
      phase === "transition" ? ("curtain" as const) : null;

    return Response.json(
      {
        view: {
          ...data,
          schemaVersion: MOVIE_BUFF_AUTHORITATIVE_SCHEMA_VERSION,
          sourceSha,
          buildIdentity: sourceSha,
          transitionPresentation,
        },
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
