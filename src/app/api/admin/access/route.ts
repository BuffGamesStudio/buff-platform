import { NextResponse } from "next/server";

import {
  createAdminErrorResponse,
  requireAdminRequest,
} from "@/lib/server/adminAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const admin = await requireAdminRequest(request);

    return NextResponse.json({
      ok: true,
      userId: admin.userId,
      platformRole: admin.platformRole,
    });
  } catch (error) {
    return createAdminErrorResponse(
      error,
      "Admin access could not be verified.",
      500,
    );
  }
}
