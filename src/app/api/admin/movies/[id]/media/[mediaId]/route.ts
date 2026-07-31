import { NextResponse } from "next/server";

import {
  createAdminErrorResponse,
  requireAdminRequest,
} from "@/lib/server/adminAuth";
import {
  archiveAdminMovieMedia,
  updateAdminMovieMedia,
} from "@/lib/server/movieAdmin";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
    mediaId: string;
  }>;
};

export async function PUT(
  request: Request,
  context: RouteContext,
) {
  try {
    await requireAdminRequest(request);
    const { id, mediaId } = await context.params;
    const body = await request.json();

    await updateAdminMovieMedia(id, mediaId, body);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return createAdminErrorResponse(
      error,
      "The clue could not be saved.",
      400,
    );
  }
}

export async function DELETE(
  request: Request,
  context: RouteContext,
) {
  try {
    await requireAdminRequest(request);
    const { id, mediaId } = await context.params;

    await archiveAdminMovieMedia(id, mediaId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return createAdminErrorResponse(
      error,
      "The clue could not be archived.",
      400,
    );
  }
}
