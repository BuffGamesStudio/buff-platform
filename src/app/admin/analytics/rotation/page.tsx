import { headers } from "next/headers";

import AdminRotationControlClient from "@/app/admin/analytics/rotation/AdminRotationControlClient";
import { isLocalAdminBypassHeaders } from "@/lib/server/adminAuth";
import {
  listMovieBuffClipAdminRows,
  type MovieBuffClipAdminRow,
} from "@/lib/server/movieBuffAnalyticsAdmin";
import { getMovieBuffGlobalPoolStatus } from "@/lib/server/movieClipper";

export const dynamic = "force-dynamic";

type PoolStatus = Awaited<ReturnType<typeof getMovieBuffGlobalPoolStatus>>;

const emptyPoolStatus: PoolStatus = {
  generatedAt: new Date(0).toISOString(),
  totalEligibleClips: 0,
  totalPrimaryReadyAssets: 0,
  totalSecondaryReadyAssets: 0,
  perLabel: [],
};

export default async function AdminRotationControlPage() {
  const requestHeaders = await headers();
  const localBypass = isLocalAdminBypassHeaders(requestHeaders);

  if (!localBypass) {
    return (
      <AdminRotationControlClient
        initialClipRows={[]}
        initialPoolStatus={emptyPoolStatus}
        initialLoaded={false}
      />
    );
  }

  let initialClipRows: MovieBuffClipAdminRow[] = [];
  let initialPoolStatus: PoolStatus = emptyPoolStatus;
  let initialError: string | null = null;

  try {
    [initialClipRows, initialPoolStatus] = await Promise.all([
      listMovieBuffClipAdminRows(160),
      getMovieBuffGlobalPoolStatus(),
    ]);
  } catch (error) {
    initialError =
      error instanceof Error
        ? error.message
        : "Rotation analytics could not be loaded.";
  }

  return (
    <AdminRotationControlClient
      initialClipRows={initialClipRows}
      initialPoolStatus={initialPoolStatus}
      initialError={initialError}
      initialLoaded
    />
  );
}
