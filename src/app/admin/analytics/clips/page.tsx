import { headers } from "next/headers";

import AdminHeader from "@/components/admin/AdminHeader";
import { isLocalAdminBypassHeaders } from "@/lib/server/adminAuth";
import { listMovieBuffClipAdminRows } from "@/lib/server/movieBuffAnalyticsAdmin";

export const dynamic = "force-dynamic";

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatScore(value: number) {
  return value.toFixed(1);
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not played yet";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatClipWindow(
  start: number | null,
  end: number | null,
  duration: number | null,
) {
  if (
    start == null &&
    end == null &&
    duration == null
  ) {
    return "Auto / runtime";
  }

  const pieces = [];

  if (start != null || end != null) {
    pieces.push(
      `${start?.toFixed(1) ?? "?"}s to ${end?.toFixed(1) ?? "?"}s`,
    );
  }

  if (duration != null) {
    pieces.push(`${duration.toFixed(1)}s`);
  }

  return pieces.join(" • ");
}

export default async function AdminClipAnalyticsPage() {
  const requestHeaders = await headers();

  if (!isLocalAdminBypassHeaders(requestHeaders)) {
    return (
      <>
        <AdminHeader
          title="Clip Analytics"
          description="Review clip-level gameplay signals, system difficulty labels, and recent performance."
          actionHref="/admin/movies"
          actionLabel="Open Movie Library"
        />

        <div className="p-5 sm:p-8">
          <section className="rounded-3xl border border-white/10 bg-zinc-950 p-6 text-zinc-300">
            <h2 className="text-xl font-black text-white">
              Admin sign-in required
            </h2>
            <p className="mt-3 text-sm leading-7 text-zinc-400">
              Sensitive analytics rows are not rendered server-side for
              non-local sessions.
            </p>
          </section>
        </div>
      </>
    );
  }

  const clipRows = await listMovieBuffClipAdminRows(180);
  const rows = [...clipRows].sort((first, second) => {
    if (second.totalPlays !== first.totalPlays) {
      return second.totalPlays - first.totalPlays;
    }

    return (second.lastPlayedAt ?? "").localeCompare(
      first.lastPlayedAt ?? ""
    );
  });

  return (
    <>
      <AdminHeader
        title="Clip Analytics"
        description="Review clip-level gameplay signals, system difficulty labels, and recent performance."
        actionHref="/admin/analytics/rotation"
        actionLabel="Open Rotation Control"
      />

      <div className="p-5 sm:p-8">
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-zinc-950">
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
            <div>
              <h2 className="text-xl font-black text-white">
                Clip-level scoring
              </h2>

              <p className="mt-1 text-sm text-zinc-500">
                {rows.length.toLocaleString()} tracked playable clips with separate
                difficulty, quality, rotation, and admin-control signals
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1620px] text-left text-sm">
              <thead className="border-b border-white/10 text-xs uppercase tracking-[0.18em] text-zinc-500">
                <tr>
                  <th className="px-6 py-4">Movie</th>
                  <th className="px-6 py-4">Section</th>
                  <th className="px-6 py-4">Window</th>
                  <th className="px-6 py-4">Target</th>
                  <th className="px-6 py-4">System</th>
                  <th className="px-6 py-4">Plays</th>
                  <th className="px-6 py-4">Sample</th>
                  <th className="px-6 py-4">Confidence</th>
                  <th className="px-6 py-4">Correct</th>
                  <th className="px-6 py-4">Hints</th>
                  <th className="px-6 py-4">Avg answer</th>
                  <th className="px-6 py-4">Difficulty score</th>
                  <th className="px-6 py-4">Quality score</th>
                  <th className="px-6 py-4">Rotation score</th>
                  <th className="px-6 py-4">Rotation weight</th>
                  <th className="px-6 py-4">Admin boost</th>
                  <th className="px-6 py-4">Last played</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-white/5 text-zinc-200">
                {rows.map((row) => (
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
                    <td className="px-6 py-4 text-zinc-400">
                      {formatClipWindow(
                        row.clipStartSeconds,
                        row.clipEndSeconds,
                        row.clipDurationSeconds,
                      )}
                    </td>
                    <td className="px-6 py-4 capitalize">
                      {row.targetDifficulty}
                    </td>
                    <td className="px-6 py-4">
                      <span className="rounded-full border border-violet-400/20 bg-violet-400/10 px-3 py-1 text-xs font-black text-violet-200">
                        {row.systemDifficultyLabel}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {row.totalPlays}
                    </td>
                    <td className="px-6 py-4">
                      {row.sampleSize}
                    </td>
                    <td className="px-6 py-4">
                      {formatPercent(row.confidenceFactor)}
                    </td>
                    <td className="px-6 py-4">
                      {formatPercent(row.correctRate)}
                    </td>
                    <td className="px-6 py-4">
                      {formatPercent(row.hintRate)}
                    </td>
                    <td className="px-6 py-4">
                      {row.avgAnswerTimeSeconds.toFixed(1)}s
                    </td>
                    <td className="px-6 py-4">
                      {formatScore(row.difficultyScore)}
                    </td>
                    <td className="px-6 py-4">
                      {formatScore(row.qualityScore)}
                    </td>
                    <td className="px-6 py-4">
                      {formatScore(row.rotationScore)}
                    </td>
                    <td className="px-6 py-4">
                      {formatScore(row.rotationWeight)}
                    </td>
                    <td className="px-6 py-4">
                      {row.adminBoost > 0 ? "+" : ""}
                      {row.adminBoost}
                    </td>
                    <td className="px-6 py-4 text-zinc-400">
                      {formatDateTime(row.lastPlayedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
