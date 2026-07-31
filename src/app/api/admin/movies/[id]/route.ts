import { NextResponse } from "next/server";

import {
  createAdminErrorResponse,
  requireAdminRequest,
} from "@/lib/server/adminAuth";
import {
  getAdminMovie,
  updateAdminMovie,
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

    return NextResponse.json({ movie });
  } catch (error) {
    return createAdminErrorResponse(
      error,
      "The movie could not be loaded.",
      404,
    );
  }
}

export async function PUT(
  request: Request,
  context: RouteContext,
) {
  try {
    await requireAdminRequest(request);
    const { id } = await context.params;
    const body = await request.json();

    await updateAdminMovie(id, body);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return createAdminErrorResponse(
      error,
      "The movie could not be saved.",
      400,
    );
  }
}
