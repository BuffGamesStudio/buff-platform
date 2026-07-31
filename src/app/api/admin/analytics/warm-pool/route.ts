import { NextResponse } from "next/server";

import {
  createAdminErrorResponse,
  requireAdminRequest,
} from "@/lib/server/adminAuth";
import {
  getMovieBuffGlobalPoolStatus,
  warmMovieBuffGlobalPool,
} from "@/lib/server/movieClipper";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdminRequest(request);

    const poolStatus =
      await getMovieBuffGlobalPoolStatus();

    return NextResponse.json({
      ok: true,
      poolStatus,
    });
  } catch (error) {
    return createAdminErrorResponse(
      error,
      "The Movie Buff pool status could not be loaded.",
      500,
    );
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminRequest(request);

    let force = false;

    try {
      const body = (await request.json()) as {
        force?: boolean;
      };
      force = body?.force === true;
    } catch {
      force = false;
    }

    const warmSummary =
      await warmMovieBuffGlobalPool({ force });

    const poolStatus =
      await getMovieBuffGlobalPoolStatus();

    return NextResponse.json({
      ok: true,
      force,
      warmSummary,
      poolStatus,
    });
  } catch (error) {
    return createAdminErrorResponse(
      error,
      "The Movie Buff pool could not be warmed.",
      400,
    );
  }
}
