import { headers } from "next/headers";

import AdminClipAnalyticsClient from "@/app/admin/analytics/clips/AdminClipAnalyticsClient";
import { isLocalAdminBypassHeaders } from "@/lib/server/adminAuth";
import {
  listMovieBuffClipAdminRows,
  type MovieBuffClipAdminRow,
} from "@/lib/server/movieBuffAnalyticsAdmin";

export const dynamic = "force-dynamic";

export default async function AdminClipAnalyticsPage() {
  const requestHeaders = await headers();
  const localBypass = isLocalAdminBypassHeaders(requestHeaders);

  if (!localBypass) {
    return (
      <AdminClipAnalyticsClient
        initialClipRows={[]}
        initialLoaded={false}
      />
    );
  }

  let initialClipRows: MovieBuffClipAdminRow[] = [];
  let initialError: string | null = null;

  try {
    initialClipRows = await listMovieBuffClipAdminRows(180);
  } catch (error) {
    initialError =
      error instanceof Error
        ? error.message
        : "Clip analytics could not be loaded.";
  }

  return (
    <AdminClipAnalyticsClient
      initialClipRows={initialClipRows}
      initialError={initialError}
      initialLoaded
    />
  );
}
