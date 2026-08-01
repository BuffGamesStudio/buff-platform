import { headers } from "next/headers";

import AdminQaContentHealthClient from "@/app/admin/analytics/qa/AdminQaContentHealthClient";
import { isLocalAdminBypassHeaders } from "@/lib/server/adminAuth";
import {
  listMovieBuffClipAdminRows,
  type MovieBuffClipAdminRow,
} from "@/lib/server/movieBuffAnalyticsAdmin";

export const dynamic = "force-dynamic";

export default async function AdminQaContentHealthPage() {
  const requestHeaders = await headers();
  const localBypass = isLocalAdminBypassHeaders(requestHeaders);

  if (!localBypass) {
    return (
      <AdminQaContentHealthClient
        initialClipRows={[]}
        initialLoaded={false}
      />
    );
  }

  let initialClipRows: MovieBuffClipAdminRow[] = [];
  let initialError: string | null = null;

  try {
    initialClipRows = await listMovieBuffClipAdminRows(200);
  } catch (error) {
    initialError =
      error instanceof Error
        ? error.message
        : "QA watchlist data could not be loaded.";
  }

  return (
    <AdminQaContentHealthClient
      initialClipRows={initialClipRows}
      initialError={initialError}
      initialLoaded
    />
  );
}
