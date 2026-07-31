import { NextResponse } from "next/server";

import {
  createAdminErrorResponse,
  requireAdminRequest,
} from "@/lib/server/adminAuth";
import {
  createAdminMovie,
  listAdminMovies,
} from "@/lib/server/movieAdmin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdminRequest(request);
    const movies = await listAdminMovies();

    return NextResponse.json({ movies });
  } catch (error) {
    return createAdminErrorResponse(
      error,
      "The Movie Library could not be loaded.",
      500,
    );
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminRequest(request);
    const body = await request.json();
    const movieId = await createAdminMovie(body);

    return NextResponse.json(
      { movieId },
      { status: 201 },
    );
  } catch (error) {
    return createAdminErrorResponse(
      error,
      "The movie could not be created.",
      400,
    );
  }
}
