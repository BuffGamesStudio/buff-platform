"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import AdminHeader from "@/components/admin/AdminHeader";
import { adminFetch, getApiErrorMessage } from "@/lib/admin/adminClient";
import type { MovieBuffClipAdminRow } from "@/lib/server/movieBuffAnalyticsAdmin";

type AdminClipAnalyticsClientProps = {
  initialClipRows: MovieBuffClipAdminRow[];
  initialError?: string | null;
  initialLoaded?: boolean;
};

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
  if (start == null && end == null && duration == null) {
    return "Auto / runtime";
  }

  const pieces = [];

  if (start != null || end != null) {
    pieces.push(`${start?.toFixed(1) ?? "?"}s to ${end?.toFixed(1) ?? "?"}s`);
  }

  if (duration != null) {
    pieces.push(`${duration.toFixed(1)}s`);
  }

  return pieces.join(" • ");
}

export default function AdminClipAnalyticsClient({
  initialClipRows,
  initialError = null,
  initialLoaded = false,
}: AdminClipAnalyticsClientProps) {
  const [clipRows, setClipRows] = useState<MovieBuffClipAdminRow[]>(initialClipRows);
  const [loading, setLoading] = useState(!initialLoaded);
  const [errorMessage, setErrorMessage] = useState<string | null>(initialError);

  const loadClipRows = useCallback(async () => {
    setErrorMessage(null);

    try {
      const response = await adminFetch("/api/admin/analytics/clips", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(
          await getApiErrorMessage(response, "Clip analytics could not be loaded."),
        );
      }

      const payload = (await response.json()) as {
        clipRows?: MovieBuffClipAdminRow[];
      };

      setClipRows(payload.clipRows ?? []);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Clip analytics could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialLoaded) {
      return;
    }

    const timer = window.setTimeout(() => {
      void loadClipRows();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [initialLoaded, loadClipRows]);

  const rows = useMemo(() => {
    return [...clipRows].sort((first, second) => {
      if (second.totalPlays !== first.totalPlays) {
        return second.totalPlays - first.totalPlays;
      }

      return (second.lastPlayedAt ?? "").localeCompare(first.lastPlayedAt ?? "");
    });
  }, [clipRows]);

  return (
    <>
      <AdminHeader
        title="Clip Analytics"
        description="Review clip-level gameplay signals, system difficulty labels, and recent performance."
        actionHref="/admin/analytics/rotation"
        actionLabel="Open Rotation Control"
      />

      <div className="p-5 sm:p-8">
        {errorMessage ? (
          <section className="mb-5 rounded-3xl border border-red-400/20 bg-red-400/10 p-5 text-sm text-red-200">
            {errorMessage}
          </section>
        ) : null}

        <div className="overflow-hidden rounded-3xl border border-white/10 bg-zinc-950">
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
            <div>
              <h2 className="text-xl font-black text-white">Clip-level scoring</h2>

              <p className="mt-1 text-sm text-zinc-500">
                {loading
                  ? "Loading tracked clips..."
                  : `${rows.length.toLocaleString()} tracked playable clips with separate difficulty, quality, rotation, and admin-control signals`}
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
                {loading ? (
                  <tr>
                    <td className="px-6 py-6 text-zinc-500" colSpan={17}>
                      Loading clip analytics...
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.contentMediaId}>
                      <td className="px-6 py-4">
                        <p className="font-black text-white">{row.movieTitle}</p>
                        <p className="text-xs text-zinc-500">{row.releaseYear ?? "Year unknown"}</p>
                      </td>
                      <td className="px-6 py-4 capitalize">{row.section ?? "any"}</td>
                      <td className="px-6 py-4 text-zinc-400">
                        {formatClipWindow(
                          row.clipStartSeconds,
                          row.clipEndSeconds,
                          row.clipDurationSeconds,
                        )}
                      </td>
                      <td className="px-6 py-4 capitalize">{row.targetDifficulty}</td>
                      <td className="px-6 py-4">
                        <span className="rounded-full border border-violet-400/20 bg-violet-400/10 px-3 py-1 text-xs font-black text-violet-200">
                          {row.systemDifficultyLabel}
                        </span>
                      </td>
                      <td className="px-6 py-4">{row.totalPlays}</td>
                      <td className="px-6 py-4">{row.sampleSize}</td>
                      <td className="px-6 py-4">{formatPercent(row.confidenceFactor)}</td>
                      <td className="px-6 py-4">{formatPercent(row.correctRate)}</td>
                      <td className="px-6 py-4">{formatPercent(row.hintRate)}</td>
                      <td className="px-6 py-4">{row.avgAnswerTimeSeconds.toFixed(1)}s</td>
                      <td className="px-6 py-4">{formatScore(row.difficultyScore)}</td>
                      <td className="px-6 py-4">{formatScore(row.qualityScore)}</td>
                      <td className="px-6 py-4">{formatScore(row.rotationScore)}</td>
                      <td className="px-6 py-4">{formatScore(row.rotationWeight)}</td>
                      <td className="px-6 py-4">
                        {row.adminBoost > 0 ? "+" : ""}
                        {row.adminBoost}
                      </td>
                      <td className="px-6 py-4 text-zinc-400">{formatDateTime(row.lastPlayedAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
