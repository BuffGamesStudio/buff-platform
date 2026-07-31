import { NextResponse } from "next/server";

import {
  createAdminErrorResponse,
  requireAdminRequest,
} from "@/lib/server/adminAuth";
import {
  createAdminMovieMedia,
  getAdminMovie,
} from "@/lib/server/movieAdmin";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(
  request: Request,
  context: RouteContext,
) {
  try {
    await requireAdminRequest(request);
    const { id } = await context.params;
    const movie = await getAdminMovie(id);

    return NextResponse.json({
      mediaItems: movie.mediaItems,
    });
  } catch (error) {
    return createAdminErrorResponse(
      error,
      "The movie clues could not be loaded.",
      400,
    );
  }
}

export async function POST(
  request: Request,
  context: RouteContext,
) {
  try {
    await requireAdminRequest(request);
    const { id } = await context.params;
    const body = await request.json();
    const mediaId = await createAdminMovieMedia(
      id,
      body,
    );

    return NextResponse.json(
      { mediaId },
      { status: 201 },
    );
  } catch (error) {
    return createAdminErrorResponse(
      error,
      "The clue could not be created.",
      400,
    );
  }
}
