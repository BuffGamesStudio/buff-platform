import { NextResponse } from "next/server";

import {
  createAdminErrorResponse,
  requireAdminRequest,
} from "@/lib/server/adminAuth";
import { getMovieBuffMatchAnalytics } from "@/lib/server/movieBuffAnalyticsAdmin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdminRequest(request);

    const analytics = await getMovieBuffMatchAnalytics(250);

    return NextResponse.json({
      ok: true,
      analytics,
    });
  } catch (error) {
    return createAdminErrorResponse(
      error,
      "Match analytics could not be loaded.",
      500,
    );
  }
}
