"use server";

import { revalidatePath } from "next/cache";

import { updateMovieBuffClipControls } from "@/lib/server/movieBuffAnalyticsAdmin";
import { warmMovieBuffGlobalPool } from "@/lib/server/movieClipper";

function parseQualityFlags(rawValue: FormDataEntryValue | null) {
  return String(rawValue ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export async function updateMovieBuffClipControlsAction(
  formData: FormData
) {
  const contentMediaId = String(
    formData.get("contentMediaId") ?? ""
  ).trim();
  const adminBoost = Number.parseInt(
    String(formData.get("adminBoost") ?? "0"),
    10
  );
  const status = String(
    formData.get("status") ?? "active"
  ).trim();

  if (!contentMediaId) {
    throw new Error("Missing clip id.");
  }

  await updateMovieBuffClipControls({
    contentMediaId,
    adminBoost: Number.isFinite(adminBoost)
      ? adminBoost
      : 0,
    status,
    qualityFlags: parseQualityFlags(
      formData.get("qualityFlags")
    ),
  });

  revalidatePath("/admin/analytics");
  revalidatePath("/admin/analytics/clips");
  revalidatePath("/admin/analytics/rotation");
  revalidatePath("/admin/analytics/qa");
  revalidatePath("/admin/analytics/matches");
}

export async function warmMovieBuffGlobalPoolAction() {
  await warmMovieBuffGlobalPool();

  revalidatePath("/admin/analytics");
  revalidatePath("/admin/analytics/clips");
  revalidatePath("/admin/analytics/rotation");
  revalidatePath("/admin/analytics/qa");
  revalidatePath("/admin/analytics/matches");
}
