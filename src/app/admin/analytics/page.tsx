import { headers } from "next/headers";

import AdminAnalyticsHomeClient from "@/app/admin/analytics/AdminAnalyticsHomeClient";
import { isLocalAdminBypassHeaders } from "@/lib/server/adminAuth";
import {
  getMovieBuffAnalyticsSummary,
  listMovieBuffClipAdminRows,
  type MovieBuffAnalyticsSummary,
  type MovieBuffClipAdminRow,
} from "@/lib/server/movieBuffAnalyticsAdmin";

export const dynamic = "force-dynamic";

const emptySummary: MovieBuffAnalyticsSummary = {
  totalMovies: 0,
  totalTrackedClips: 0,
  playableClips: 0,
  activeRotationClips: 0,
  recentFailures7d: 0,
  events24h: 0,
};

export default async function AdminAnalyticsHomePage() {
  const requestHeaders = await headers();
  const localBypass = isLocalAdminBypassHeaders(requestHeaders);

  if (!localBypass) {
    return (
      <AdminAnalyticsHomeClient
        initialSummary={emptySummary}
        initialClipRows={[]}
        initialLoaded={false}
      />
    );
  }

  let initialSummary: MovieBuffAnalyticsSummary = emptySummary;
  let initialClipRows: MovieBuffClipAdminRow[] = [];
  let initialError: string | null = null;

  try {
    [initialSummary, initialClipRows] = await Promise.all([
      getMovieBuffAnalyticsSummary(),
      listMovieBuffClipAdminRows(120),
    ]);
  } catch (error) {
    initialError =
      error instanceof Error
        ? error.message
        : "Movie Buff analytics could not be loaded.";
  }

  return (
    <AdminAnalyticsHomeClient
      initialSummary={initialSummary}
      initialClipRows={initialClipRows}
      initialError={initialError}
      initialLoaded
    />
  );
}
