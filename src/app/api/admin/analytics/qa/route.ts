import { NextResponse } from "next/server";

import {
  createAdminErrorResponse,
  requireAdminRequest,
} from "@/lib/server/adminAuth";
import { listMovieBuffClipAdminRows } from "@/lib/server/movieBuffAnalyticsAdmin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdminRequest(request);

    const clipRows = await listMovieBuffClipAdminRows(200);

    return NextResponse.json({
      ok: true,
      clipRows,
    });
  } catch (error) {
    return createAdminErrorResponse(
      error,
      "QA watchlist data could not be loaded.",
      500,
    );
  }
}
