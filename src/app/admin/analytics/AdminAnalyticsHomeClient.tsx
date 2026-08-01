"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  Clapperboard,
  RefreshCw,
  ShieldAlert,
  Shuffle,
} from "lucide-react";

import AdminHeader from "@/components/admin/AdminHeader";
import { adminFetch, getApiErrorMessage } from "@/lib/admin/adminClient";
import type {
  MovieBuffAnalyticsSummary,
  MovieBuffClipAdminRow,
} from "@/lib/server/movieBuffAnalyticsAdmin";

type AdminAnalyticsHomeClientProps = {
  initialSummary: MovieBuffAnalyticsSummary;
  initialClipRows: MovieBuffClipAdminRow[];
  initialError?: string | null;
  initialLoaded?: boolean;
};

const emptySummary: MovieBuffAnalyticsSummary = {
  totalMovies: 0,
  totalTrackedClips: 0,
  playableClips: 0,
  activeRotationClips: 0,
  recentFailures7d: 0,
  events24h: 0,
};

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not played yet";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function AdminAnalyticsHomeClient({
  initialSummary,
  initialClipRows,
  initialError = null,
  initialLoaded = false,
}: AdminAnalyticsHomeClientProps) {
  const [summary, setSummary] = useState<MovieBuffAnalyticsSummary>(
    initialSummary ?? emptySummary,
  );
  const [clipRows, setClipRows] = useState<MovieBuffClipAdminRow[]>(
    initialClipRows ?? [],
  );
  const [loading, setLoading] = useState(!initialLoaded);
  const [errorMessage, setErrorMessage] = useState<string | null>(initialError);

  const loadAnalytics = useCallback(async () => {
    setErrorMessage(null);

    try {
      const response = await adminFetch("/api/admin/analytics", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(
          await getApiErrorMessage(
            response,
            "Movie Buff analytics could not be loaded.",
          ),
        );
      }

      const payload = (await response.json()) as {
        summary?: MovieBuffAnalyticsSummary;
        clipRows?: MovieBuffClipAdminRow[];
      };

      setSummary(payload.summary ?? emptySummary);
      setClipRows(payload.clipRows ?? []);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Movie Buff analytics could not be loaded.",
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
      void loadAnalytics();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [initialLoaded, loadAnalytics]);

  const qaWatchlist = useMemo(() => {
    return [...clipRows]
      .filter(
        (row) =>
          row.qualityScore < 80 ||
          row.totalLoadFailures > 0 ||
          row.qualityFlags.length > 0,
      )
      .sort((first, second) => {
        if (first.qualityScore !== second.qualityScore) {
          return first.qualityScore - second.qualityScore;
        }

        return second.totalLoadFailures - first.totalLoadFailures;
      })
      .slice(0, 6);
  }, [clipRows]);

  const sections = [
    {
      href: "/admin/movies",
      icon: Clapperboard,
      title: "Content Library",
      description: "Movie records, source metadata, and clip inventory.",
    },
    {
      href: "/admin/analytics/clips",
      icon: BarChart3,
      title: "Clip Analytics",
      description: "Difficulty, hint rate, solve time, and recent clip behavior.",
    },
    {
      href: "/admin/analytics/rotation",
      icon: Shuffle,
      title: "Rotation Control",
      description: "Admin boost, live rotation status, and weighted selection inputs.",
    },
    {
      href: "/admin/analytics/qa",
      icon: ShieldAlert,
      title: "QA / Content Health",
      description: "Broken playback, weak clips, and obvious or giveaway content.",
    },
    {
      href: "/admin/analytics/matches",
      icon: RefreshCw,
      title: "Match Analytics",
      description: "Round event history, room flow, and recent live usage.",
    },
  ];

  return (
    <>
      <AdminHeader
        title="Movie Buff Analytics"
        description="Track clips, rounds, and rotation performance from one admin hub."
        actionHref="/admin/analytics/rotation"
        actionLabel="Open Rotation Control"
      />

      <div className="space-y-8 p-5 sm:p-8">
        {errorMessage ? (
          <section className="rounded-3xl border border-red-400/20 bg-red-400/10 p-5 text-sm text-red-200">
            {errorMessage}
          </section>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {[
            {
              label: "Tracked movies",
              value: summary.totalMovies,
            },
            {
              label: "Tracked clips",
              value: summary.totalTrackedClips,
            },
            {
              label: "Playable clips",
              value: summary.playableClips,
            },
            {
              label: "Active rotation",
              value: summary.activeRotationClips,
            },
            {
              label: "Events (24h)",
              value: summary.events24h,
            },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-3xl border border-white/10 bg-zinc-950 p-5"
            >
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-zinc-500">
                {card.label}
              </p>

              <p className="mt-3 text-3xl font-black text-white">
                {card.value.toLocaleString()}
              </p>
            </div>
          ))}
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          {sections.map((section) => {
            const Icon = section.icon;

            return (
              <Link
                key={section.href}
                href={section.href}
                className="rounded-3xl border border-white/10 bg-zinc-950 p-6 transition hover:border-violet-400/30 hover:bg-zinc-900"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-400/10 text-violet-300">
                  <Icon className="h-6 w-6" />
                </div>

                <h2 className="mt-5 text-xl font-black text-white">
                  {section.title}
                </h2>

                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  {section.description}
                </p>
              </Link>
            );
          })}
        </section>

        <section className="rounded-3xl border border-white/10 bg-zinc-950 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-zinc-500">
                QA watchlist
              </p>

              <h2 className="mt-2 text-2xl font-black text-white">
                Clips currently most likely to need review
              </h2>
            </div>

            <Link
              href="/admin/analytics/qa"
              className="rounded-xl border border-white/10 px-4 py-2 text-sm font-black text-zinc-300 transition hover:border-violet-400/40 hover:text-white"
            >
              Open QA
            </Link>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                <tr>
                  <th className="pb-3">Movie</th>
                  <th className="pb-3">Section</th>
                  <th className="pb-3">Quality</th>
                  <th className="pb-3">Failures</th>
                  <th className="pb-3">Flags</th>
                  <th className="pb-3">Last activity</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-white/5 text-zinc-200">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-zinc-500">
                      Loading analytics...
                    </td>
                  </tr>
                ) : qaWatchlist.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-zinc-500">
                      No current QA watchlist items.
                    </td>
                  </tr>
                ) : (
                  qaWatchlist.map((row) => (
                    <tr key={row.contentMediaId}>
                      <td className="py-4 pr-4">
                        <p className="font-black text-white">{row.movieTitle}</p>
                        <p className="text-xs text-zinc-500">
                          {row.releaseYear ?? "Year unknown"}
                        </p>
                      </td>
                      <td className="py-4 pr-4 capitalize">{row.section ?? "any"}</td>
                      <td className="py-4 pr-4">{row.qualityScore.toFixed(1)}</td>
                      <td className="py-4 pr-4">{row.totalLoadFailures}</td>
                      <td className="py-4 pr-4">
                        {row.qualityFlags.length > 0 ? row.qualityFlags.join(", ") : "None"}
                      </td>
                      <td className="py-4">
                        {formatDateTime(row.lastPlayedAt ?? row.lastLoadedAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-3xl border border-amber-400/20 bg-amber-400/10 p-5 text-amber-100">
          <p className="text-sm font-bold uppercase tracking-[0.18em]">
            Current launch risk
          </p>

          <p className="mt-2 text-sm leading-7">
            There have been{" "}
            <span className="font-black">
              {summary.recentFailures7d.toLocaleString()}
            </span>{" "}
            clip-load failures recorded in the last 7 days. Use QA and Rotation
            Control together: weak clips should not stay in live rotation just
            because they have an admin boost.
          </p>
        </section>
      </div>
    </>
  );
}
