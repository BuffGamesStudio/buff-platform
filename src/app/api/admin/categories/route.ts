import { NextResponse } from "next/server";

import {
  createAdminErrorResponse,
  requireAdminRequest,
} from "@/lib/server/adminAuth";
import { listAdminCategories } from "@/lib/server/movieAdmin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdminRequest(request);
    const categories = await listAdminCategories();

    return NextResponse.json({ categories });
  } catch (error) {
    return createAdminErrorResponse(
      error,
      "The categories could not be loaded.",
      500,
    );
  }
}
