import { headers } from "next/headers";

import AdminHeader from "@/components/admin/AdminHeader";
import { isLocalAdminBypassHeaders } from "@/lib/server/adminAuth";
import { listMovieBuffClipAdminRows } from "@/lib/server/movieBuffAnalyticsAdmin";

export const dynamic = "force-dynamic";

function formatDateTime(value: string | null) {
  if (!value) {
    return "No playback yet";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function AdminQaContentHealthPage() {
  const requestHeaders = await headers();

  if (!isLocalAdminBypassHeaders(requestHeaders)) {
    return (
      <>
        <AdminHeader
          title="QA / Content Health"
          description="Surface weak, broken, or giveaway-heavy clips before they hurt public match quality."
          actionHref="/admin/movies"
          actionLabel="Open Movie Library"
        />

        <div className="p-5 sm:p-8">
          <section className="rounded-3xl border border-white/10 bg-zinc-950 p-6 text-zinc-300">
            <h2 className="text-xl font-black text-white">
              Admin sign-in required
            </h2>
            <p className="mt-3 text-sm leading-7 text-zinc-400">
              QA watchlist data is not rendered server-side for non-local
              sessions.
            </p>
          </section>
        </div>
      </>
    );
  }

  const clipRows = await listMovieBuffClipAdminRows(200);
  const rows = [...clipRows]
    .filter(
      (row) =>
        row.qualityFlags.length > 0 ||
        row.totalLoadFailures > 0 ||
        row.totalTimeouts > 0 ||
        row.qualityScore < 80
    )
    .sort((first, second) => {
      if (first.qualityScore !== second.qualityScore) {
        return first.qualityScore - second.qualityScore;
      }

      if (second.totalLoadFailures !== first.totalLoadFailures) {
        return second.totalLoadFailures - first.totalLoadFailures;
      }

      return second.totalTimeouts - first.totalTimeouts;
    });

  return (
    <>
      <AdminHeader
        title="QA / Content Health"
        description="Surface weak, broken, or giveaway-heavy clips before they hurt public match quality."
      />

      <div className="space-y-6 p-5 sm:p-8">
        <section className="rounded-3xl border border-white/10 bg-zinc-950 p-5">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-zinc-500">
            Watchlist size
          </p>

          <p className="mt-2 text-3xl font-black text-white">
            {rows.length.toLocaleString()} clips
          </p>
        </section>

        <section className="overflow-hidden rounded-3xl border border-white/10 bg-zinc-950">
          <div className="overflow-x-auto">
            <table className="min-w-[1200px] text-left text-sm">
              <thead className="border-b border-white/10 text-xs uppercase tracking-[0.18em] text-zinc-500">
                <tr>
                  <th className="px-6 py-4">Movie</th>
                  <th className="px-6 py-4">Section</th>
                  <th className="px-6 py-4">Quality</th>
                  <th className="px-6 py-4">Load failures</th>
                  <th className="px-6 py-4">Timeouts</th>
                  <th className="px-6 py-4">Flags</th>
                  <th className="px-6 py-4">Rotation status</th>
                  <th className="px-6 py-4">Last activity</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-white/5 text-zinc-200">
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-6 py-6 text-zinc-500"
                    >
                      No current QA issues.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.contentMediaId}>
                      <td className="px-6 py-4">
                        <p className="font-black text-white">
                          {row.movieTitle}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {row.releaseYear ?? "Year unknown"}
                        </p>
                      </td>
                      <td className="px-6 py-4 capitalize">
                        {row.section ?? "any"}
                      </td>
                      <td className="px-6 py-4">
                        {row.qualityScore.toFixed(1)}
                      </td>
                      <td className="px-6 py-4">
                        {row.totalLoadFailures}
                      </td>
                      <td className="px-6 py-4">
                        {row.totalTimeouts}
                      </td>
                      <td className="px-6 py-4">
                        {row.qualityFlags.length > 0
                          ? row.qualityFlags.join(", ")
                          : "Observed failures only"}
                      </td>
                      <td className="px-6 py-4">
                        {row.status}
                      </td>
                      <td className="px-6 py-4 text-zinc-400">
                        {formatDateTime(
                          row.lastPlayedAt ??
                            row.lastLoadedAt
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
