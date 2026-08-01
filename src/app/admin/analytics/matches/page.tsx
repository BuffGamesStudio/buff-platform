import { headers } from "next/headers";

import AdminMatchAnalyticsClient from "@/app/admin/analytics/matches/AdminMatchAnalyticsClient";
import { isLocalAdminBypassHeaders } from "@/lib/server/adminAuth";
import {
  getMovieBuffMatchAnalytics,
  type MovieBuffMatchAnalytics,
} from "@/lib/server/movieBuffAnalyticsAdmin";

export const dynamic = "force-dynamic";

const emptyAnalytics: MovieBuffMatchAnalytics = {
  recentEvents: [],
  eventCounts: [],
  roomSummaries: [],
};

export default async function AdminMatchAnalyticsPage() {
  const requestHeaders = await headers();
  const localBypass = isLocalAdminBypassHeaders(requestHeaders);

  if (!localBypass) {
    return (
      <AdminMatchAnalyticsClient
        initialAnalytics={emptyAnalytics}
        initialLoaded={false}
      />
    );
  }

  let initialAnalytics: MovieBuffMatchAnalytics = emptyAnalytics;
  let initialError: string | null = null;

  try {
    initialAnalytics = await getMovieBuffMatchAnalytics(250);
  } catch (error) {
    initialError =
      error instanceof Error
        ? error.message
        : "Match analytics could not be loaded.";
  }

  return (
    <AdminMatchAnalyticsClient
      initialAnalytics={initialAnalytics}
      initialError={initialError}
      initialLoaded
    />
  );
}
