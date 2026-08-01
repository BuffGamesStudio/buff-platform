import { NextResponse } from "next/server";

import {
  createAdminErrorResponse,
  requireAdminRequest,
} from "@/lib/server/adminAuth";
import {
  listMovieBuffClipAdminRows,
  updateMovieBuffClipControls,
} from "@/lib/server/movieBuffAnalyticsAdmin";
import { getMovieBuffGlobalPoolStatus } from "@/lib/server/movieClipper";

export const dynamic = "force-dynamic";

function parseQualityFlags(rawValue: unknown) {
  if (Array.isArray(rawValue)) {
    return rawValue
      .map((entry) => String(entry ?? "").trim())
      .filter(Boolean);
  }

  if (typeof rawValue === "string") {
    return rawValue
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
}

export async function GET(request: Request) {
  try {
    await requireAdminRequest(request);

    const [clipRows, poolStatus] = await Promise.all([
      listMovieBuffClipAdminRows(160),
      getMovieBuffGlobalPoolStatus(),
    ]);

    return NextResponse.json({
      ok: true,
      clipRows,
      poolStatus,
    });
  } catch (error) {
    return createAdminErrorResponse(
      error,
      "Rotation analytics could not be loaded.",
      500,
    );
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdminRequest(request);

    const body = (await request.json()) as {
      contentMediaId?: string;
      adminBoost?: number;
      status?: string;
      qualityFlags?: unknown;
    };

    const contentMediaId = String(body.contentMediaId ?? "").trim();
    const status = String(body.status ?? "active").trim();
    const parsedAdminBoost = Number(body.adminBoost ?? 0);
    const adminBoost = Number.isFinite(parsedAdminBoost)
      ? parsedAdminBoost
      : 0;

    if (!contentMediaId) {
      return NextResponse.json(
        { error: "Missing clip id." },
        { status: 400 },
      );
    }

    await updateMovieBuffClipControls({
      contentMediaId,
      adminBoost,
      status,
      qualityFlags: parseQualityFlags(body.qualityFlags),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return createAdminErrorResponse(
      error,
      "Clip controls could not be updated.",
      400,
    );
  }
}
