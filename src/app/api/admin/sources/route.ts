import { NextResponse } from "next/server";

import {
  createAdminErrorResponse,
  requireAdminRequest,
} from "@/lib/server/adminAuth";
import { listContentSources } from "@/lib/server/contentSources";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdminRequest(request);

    const sources = await listContentSources();

    return NextResponse.json({
      ok: true,
      sources,
    });
  } catch (error) {
    return createAdminErrorResponse(
      error,
      "Source registry data could not be loaded.",
      500,
    );
  }
}
