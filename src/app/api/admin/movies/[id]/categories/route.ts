import { NextResponse } from "next/server";

import {
  createAdminErrorResponse,
  requireAdminRequest,
} from "@/lib/server/adminAuth";
import { updateAdminMovieCategories } from "@/lib/server/movieAdmin";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PUT(
  request: Request,
  context: RouteContext,
) {
  try {
    await requireAdminRequest(request);
    const { id } = await context.params;
    const body = await request.json();

    await updateAdminMovieCategories(id, body);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return createAdminErrorResponse(
      error,
      "The categories could not be saved.",
      400,
    );
  }
}
