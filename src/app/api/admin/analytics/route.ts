import { NextResponse } from "next/server";

import {
  createAdminErrorResponse,
  requireAdminRequest,
} from "@/lib/server/adminAuth";
import {
  getMovieBuffAnalyticsSummary,
  listMovieBuffClipAdminRows,
} from "@/lib/server/movieBuffAnalyticsAdmin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdminRequest(request);

    const [summary, clipRows] = await Promise.all([
      getMovieBuffAnalyticsSummary(),
      listMovieBuffClipAdminRows(120),
    ]);

    return NextResponse.json({
      ok: true,
      summary,
      clipRows,
    });
  } catch (error) {
    return createAdminErrorResponse(
      error,
      "Movie Buff analytics could not be loaded.",
      500,
    );
  }
}
