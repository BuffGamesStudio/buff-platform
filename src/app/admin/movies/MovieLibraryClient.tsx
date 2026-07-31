"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ChevronDown,
  Film,
  LoaderCircle,
  ChevronRight,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import AdminHeader from "@/components/admin/AdminHeader";
import { adminFetch } from "@/lib/admin/adminClient";

type MovieStatus =
  | "Ready"
  | "Draft"
  | "Missing media"
  | "Archived";

type Movie = {
  id: string;
  title: string;
  year: number | null;
  posterUrl: string | null;
  category: string;
  sourceName: string | null;
  sourceUrl: string | null;
  countryOrOrigin: string | null;
  language: string | null;
  clips: number;
  playableClips: number;
  totalPlays: number;
  totalHintsUsed: number;
  lastPlayedAt: string | null;
  ingestStatus: string;
  autoClipStatus: string;
  lifecycleStatus: string;
  difficulty: string;
  license: string;
  publicationStatus: string;
  status: MovieStatus;
  createdAt: string;
};

type MovieLibraryClientProps = {
  initialMovies: Movie[];
  initialError?: string | null;
  initialLoaded?: boolean;
};

const statusStyles: Record<MovieStatus, string> = {
  Ready:
    "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
  Draft:
    "border-zinc-400/20 bg-zinc-400/10 text-zinc-300",
  "Missing media":
    "border-amber-400/20 bg-amber-400/10 text-amber-300",
  Archived:
    "border-rose-400/20 bg-rose-400/10 text-rose-300",
};

async function getApiErrorMessage(
  response: Response,
  fallbackMessage: string,
) {
  try {
    const payload = (await response.json()) as {
      error?: string;
    };

    return payload.error || fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}

function formatDateTime(
  value: string | null
) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function toneForOps(value: string) {
  const normalized = value.trim().toLowerCase();

  if (
    normalized.includes("ready") ||
    normalized === "active"
  ) {
    return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
  }

  if (
    normalized.includes("review") ||
    normalized.includes("pending") ||
    normalized.includes("metadata")
  ) {
    return "border-amber-400/20 bg-amber-400/10 text-amber-100";
  }

  if (
    normalized.includes("inactive") ||
    normalized.includes("retired")
  ) {
    return "border-rose-400/20 bg-rose-400/10 text-rose-200";
  }

  return "border-white/10 bg-white/5 text-zinc-200";
}

export default function MovieLibraryClient({
  initialMovies,
  initialError = null,
  initialLoaded = false,
}: MovieLibraryClientProps) {
  const router = useRouter();
  const [movies, setMovies] =
    useState<Movie[]>(initialMovies);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All categories");
  const [status, setStatus] = useState("All statuses");
  const [loading, setLoading] =
    useState(!initialLoaded);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] =
    useState<string | null>(initialError);

  const loadMovies = useCallback(async (showRefreshState = false) => {
    if (showRefreshState) {
      setRefreshing(true);
    }

    setErrorMessage(null);

    try {
      const response = await adminFetch("/api/admin/movies", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(
          await getApiErrorMessage(
            response,
            "The Movie Library could not be loaded.",
          ),
        );
      }

      const payload = (await response.json()) as {
        movies?: Movie[];
      };

      setMovies(payload.movies ?? []);
    } catch (error) {
      console.error("Unable to load Movie Library:", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The Movie Library could not be loaded.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (initialLoaded) {
      return;
    }

    const loadTimer = window.setTimeout(() => {
      void loadMovies();
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, [initialLoaded, loadMovies]);

  const categories = useMemo(() => {
    return Array.from(
      new Set(movies.map((movie) => movie.category)),
    ).sort((first, second) => first.localeCompare(second));
  }, [movies]);

  const visibleMovies = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return movies.filter((movie) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        movie.title.toLowerCase().includes(normalizedQuery) ||
        movie.year?.toString().includes(normalizedQuery) ||
        movie.id.toLowerCase().includes(normalizedQuery);

      const matchesCategory =
        category === "All categories" ||
        movie.category === category;

      const matchesStatus =
        status === "All statuses" || movie.status === status;

      return matchesQuery && matchesCategory && matchesStatus;
    });
  }, [category, movies, query, status]);

  const openMovieEditor = useCallback(
    (movieId: string) => {
      router.push(`/admin/movies/${movieId}`);
    },
    [router],
  );

  return (
    <>
      <AdminHeader
        title="Movie Library"
        description="Manage published, draft and archived Movie Buff records from one library."
      />

      <div className="space-y-6 p-5 sm:p-8">
        <section className="flex flex-col justify-between gap-4 rounded-3xl border border-white/10 bg-zinc-950 p-5 xl:flex-row xl:items-center">
          <div>
            <h2 className="text-xl font-black text-white">
              All movies
            </h2>

            <p className="mt-1 text-sm text-zinc-500">
              {loading
                ? "Loading the Content Engine..."
                : `${visibleMovies.length} of ${movies.length} movie${
                    movies.length === 1 ? "" : "s"
                  } visible`}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => void loadMovies(true)}
              disabled={refreshing}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-black text-zinc-300 transition hover:border-violet-400/40 hover:text-white disabled:cursor-wait disabled:opacity-60"
            >
              <RefreshCw
                className={`h-4 w-4 ${
                  refreshing ? "animate-spin" : ""
                }`}
              />
              Refresh
            </button>

            <button
              type="button"
              onClick={() => router.push("/admin/movies/new")}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-500 px-5 py-3 text-sm font-black text-white transition hover:bg-violet-400"
            >
              <Plus className="h-4 w-4" />
              Add movie
            </button>
          </div>
        </section>

        {errorMessage ? (
          <section className="flex items-start gap-3 rounded-2xl border border-red-400/20 bg-red-400/10 p-5 text-red-200">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />

            <div>
              <p className="font-black">
                Unable to load the Movie Library
              </p>

              <p className="mt-1 text-sm text-red-200/70">
                {errorMessage}
              </p>
            </div>
          </section>
        ) : null}

        <section className="overflow-hidden rounded-3xl border border-white/10 bg-zinc-950">
          <div className="border-b border-white/10 p-5">
            <div className="grid gap-3 xl:grid-cols-[1fr_auto_auto]">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />

                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  type="search"
                  placeholder="Search by title, year or ID..."
                  className="h-11 w-full rounded-xl border border-white/10 bg-black/40 pl-10 pr-4 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-violet-400"
                />
              </label>

              <label className="relative block">
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="h-11 min-w-52 appearance-none rounded-xl border border-white/10 bg-black/40 pl-4 pr-10 text-sm font-semibold text-zinc-300 outline-none transition focus:border-violet-400"
                >
                  <option>All categories</option>

                  {categories.map((categoryName) => (
                    <option key={categoryName}>
                      {categoryName}
                    </option>
                  ))}
                </select>

                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              </label>

              <label className="relative block">
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  className="h-11 min-w-48 appearance-none rounded-xl border border-white/10 bg-black/40 pl-4 pr-10 text-sm font-semibold text-zinc-300 outline-none transition focus:border-violet-400"
                >
                  <option>All statuses</option>
                  <option>Ready</option>
                  <option>Missing media</option>
                  <option>Draft</option>
                  <option>Archived</option>
                </select>

                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              </label>
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-96 flex-col items-center justify-center px-6 py-16 text-center">
              <LoaderCircle className="h-10 w-10 animate-spin text-violet-300" />

              <h3 className="mt-5 text-xl font-black text-white">
                Loading movies
              </h3>

              <p className="mt-2 text-sm text-zinc-500">
                Reading from the Buff Games Content Engine.
              </p>
            </div>
          ) : visibleMovies.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1520px]">
                <thead>
                  <tr className="border-b border-white/10 text-left text-[11px] font-black uppercase tracking-[0.16em] text-zinc-600">
                    <th className="px-5 py-4">Movie</th>
                    <th className="px-5 py-4">Year</th>
                    <th className="px-5 py-4">Category</th>
                    <th className="px-5 py-4">Source</th>
                    <th className="px-5 py-4">Origin</th>
                    <th className="px-5 py-4">Media</th>
                    <th className="px-5 py-4">Plays</th>
                    <th className="px-5 py-4">Ops</th>
                    <th className="px-5 py-4">Last Played</th>
                    <th className="px-5 py-4">Difficulty</th>
                    <th className="px-5 py-4">License</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4 text-right">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {visibleMovies.map((movie) => (
                    <tr
                      key={movie.id}
                      role="link"
                      tabIndex={0}
                      aria-label={`Open editor for ${movie.title}`}
                      onClick={() => openMovieEditor(movie.id)}
                      onKeyDown={(event) => {
                        if (
                          event.key === "Enter" ||
                          event.key === " "
                        ) {
                          event.preventDefault();
                          openMovieEditor(movie.id);
                        }
                      }}
                      className="cursor-pointer border-b border-white/5 transition last:border-b-0 hover:bg-white/[0.025] focus:outline-none focus-visible:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-violet-400/60"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-4">
                          <div
                            className="flex h-16 w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/30 to-fuchsia-500/20 bg-cover bg-center text-violet-200"
                            style={
                              movie.posterUrl
                                ? {
                                    backgroundImage: `url("${movie.posterUrl}")`,
                                  }
                                : undefined
                            }
                          >
                            {!movie.posterUrl ? (
                              <Film className="h-5 w-5" />
                            ) : null}
                          </div>

                          <div className="min-w-0">
                            <p className="truncate font-black text-white">
                              {movie.title}
                            </p>

                            <p
                              className="mt-1 max-w-52 truncate text-xs text-zinc-600"
                              title={movie.id}
                            >
                              ID {movie.id}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4 text-sm font-semibold text-zinc-400">
                        {movie.year ?? "—"}
                      </td>

                      <td className="px-5 py-4">
                        <span className="rounded-lg border border-violet-400/20 bg-violet-400/10 px-2.5 py-1 text-xs font-bold text-violet-300">
                          {movie.category}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <p className="text-sm font-semibold text-zinc-200">
                          {movie.sourceName ?? "Unknown source"}
                        </p>

                        <p className="mt-1 max-w-48 truncate text-xs text-zinc-500">
                          {movie.sourceUrl ?? "No source URL"}
                        </p>
                      </td>

                      <td className="px-5 py-4">
                        <p className="text-sm font-semibold text-zinc-200">
                          {movie.countryOrOrigin ?? "Unknown"}
                        </p>

                        <p className="mt-1 text-xs text-zinc-500">
                          {movie.language ?? "Language unknown"}
                        </p>
                      </td>

                      <td className="px-5 py-4">
                        <p className="text-sm font-bold text-zinc-200">
                          {movie.clips} total
                        </p>

                        <p className="mt-1 text-xs text-zinc-500">
                          {movie.playableClips} playable
                        </p>
                      </td>

                      <td className="px-5 py-4">
                        <p className="text-sm font-bold text-zinc-200">
                          {movie.totalPlays}
                        </p>

                        <p className="mt-1 text-xs text-zinc-500">
                          {movie.totalHintsUsed} hints
                        </p>
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex flex-col gap-2">
                          {[
                            movie.lifecycleStatus,
                            movie.ingestStatus,
                            movie.autoClipStatus,
                          ].map((value) => (
                            <span
                              key={value}
                              className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-black ${toneForOps(value)}`}
                            >
                              {value}
                            </span>
                          ))}
                        </div>
                      </td>

                      <td className="px-5 py-4 text-sm font-semibold text-zinc-400">
                        {formatDateTime(movie.lastPlayedAt)}
                      </td>

                      <td className="px-5 py-4 text-sm font-semibold text-zinc-400">
                        {movie.difficulty}
                      </td>

                      <td className="px-5 py-4 text-sm font-semibold text-zinc-400">
                        {movie.license}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-black ${statusStyles[movie.status]}`}
                          title={movie.publicationStatus}
                        >
                          {movie.status}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openMovieEditor(movie.id);
                          }}
                          aria-label={`Open editor for ${movie.title}`}
                          title="Open movie editor"
                          className="rounded-lg p-2 text-zinc-500 transition hover:bg-white/5 hover:text-white"
                        >
                          <ChevronRight className="h-5 w-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex min-h-96 flex-col items-center justify-center px-6 py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-400/10 text-violet-300">
                <Film className="h-8 w-8" />
              </div>

              <h3 className="mt-5 text-xl font-black text-white">
                No movies found
              </h3>

              <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">
                Adjust the search or filtering options. Active legacy
                movies should already be available through the new Content
                Engine.
              </p>
            </div>
          )}
        </section>

        <p className="text-center text-xs text-zinc-700">
          Source: Supabase content_items, content_media,
          movie_buff_movie_analytics and content_categories.
        </p>
      </div>
    </>
  );
}



