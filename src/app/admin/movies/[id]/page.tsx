"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertCircle,
  Archive,
  ArrowLeft,
  CheckCircle2,
  Clapperboard,
  Film,
  LoaderCircle,
  PencilLine,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import AdminHeader from "@/components/admin/AdminHeader";
import { adminFetch } from "@/lib/admin/adminClient";

type MovieForm = {
  title: string;
  releaseYear: string;
  posterUrl: string;
  difficulty: string;
  publicationStatus: string;
  licensingStatus: string;
};

type MovieMedia = {
  id: string;
  mediaType: string;
  roundPosition: string;
  title: string;
  prompt: string;
  quoteText: string;
  mediaUrl: string;
  thumbnailUrl: string;
  startSeconds: string;
  endSeconds: string;
  durationSeconds: string;
  difficulty: string;
  licensingStatus: string;
  sourceName: string;
  sourceUrl: string;
  attribution: string;
  sortOrder: number;
  isHidden: boolean;
  isActive: boolean;
};

type MediaForm = {
  mediaType: string;
  roundPosition: string;
  title: string;
  prompt: string;
  quoteText: string;
  mediaUrl: string;
  thumbnailUrl: string;
  startSeconds: string;
  endSeconds: string;
  difficulty: string;
  licensingStatus: string;
  sourceName: string;
  sourceUrl: string;
  attribution: string;
  sortOrder: string;
  isHidden: boolean;
};

type CategoryOption = {
  id: string;
  name: string;
  slug: string;
  description: string;
};

type MovieDetailResponse = {
  movie?: {
    id: string;
    title: string;
    releaseYear: string;
    posterUrl: string;
    difficulty: string;
    publicationStatus: string;
    licensingStatus: string;
    categoryIds: string[];
    primaryCategoryId: string | null;
    mediaCount: number;
    mediaItems: MovieMedia[];
  };
};

type CategoryListResponse = {
  categories?: CategoryOption[];
};

const successMessageKey = "buff-admin-movie-success";

const emptyForm: MovieForm = {
  title: "",
  releaseYear: "",
  posterUrl: "",
  difficulty: "medium",
  publicationStatus: "draft",
  licensingStatus: "pending",
};

const emptyMediaForm: MediaForm = {
  mediaType: "trivia",
  roundPosition: "any",
  title: "",
  prompt: "",
  quoteText: "",
  mediaUrl: "",
  thumbnailUrl: "",
  startSeconds: "",
  endSeconds: "",
  difficulty: "medium",
  licensingStatus: "pending",
  sourceName: "",
  sourceUrl: "",
  attribution: "",
  sortOrder: "0",
  isHidden: false,
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

function storeSuccessMessage(message: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(
    successMessageKey,
    message,
  );
}

function consumeSuccessMessage() {
  if (typeof window === "undefined") {
    return null;
  }

  const message = window.sessionStorage.getItem(
    successMessageKey,
  );

  if (!message) {
    return null;
  }

  window.sessionStorage.removeItem(successMessageKey);

  return message;
}

function formatLabel(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getMediaSummary(media: MovieMedia) {
  return (
    media.title ||
    media.prompt ||
    media.quoteText ||
    media.mediaUrl ||
    "No clue details added yet."
  );
}

function createMediaFormFromItem(
  media: MovieMedia,
): MediaForm {
  return {
    mediaType: media.mediaType,
    roundPosition: media.roundPosition,
    title: media.title,
    prompt: media.prompt,
    quoteText: media.quoteText,
    mediaUrl: media.mediaUrl,
    thumbnailUrl: media.thumbnailUrl,
    startSeconds: media.startSeconds,
    endSeconds: media.endSeconds,
    difficulty: media.difficulty,
    licensingStatus: media.licensingStatus,
    sourceName: media.sourceName,
    sourceUrl: media.sourceUrl,
    attribution: media.attribution,
    sortOrder: media.sortOrder.toString(),
    isHidden: media.isHidden,
  };
}

export default function MovieDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const movieId = params.id;
  const isNewMovie = movieId === "new";

  const [form, setForm] = useState<MovieForm>(emptyForm);
  const [availableCategories, setAvailableCategories] =
    useState<CategoryOption[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] =
    useState<string[]>([]);
  const [primaryCategoryId, setPrimaryCategoryId] =
    useState<string | null>(null);
  const [mediaItems, setMediaItems] = useState<MovieMedia[]>([]);
  const [mediaForm, setMediaForm] =
    useState<MediaForm>(emptyMediaForm);
  const [editingMediaId, setEditingMediaId] =
    useState<string | null>(null);
  const [mediaCount, setMediaCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [categoryLoading, setCategoryLoading] =
    useState(true);
  const [categorySaving, setCategorySaving] =
    useState(false);
  const [mediaSaving, setMediaSaving] = useState(false);
  const [autoClipSaving, setAutoClipSaving] =
    useState(false);
  const [confirmMovieArchive, setConfirmMovieArchive] =
    useState(false);
  const [confirmMediaArchiveId, setConfirmMediaArchiveId] =
    useState<string | null>(null);
  const [archivingMediaId, setArchivingMediaId] =
    useState<string | null>(null);
  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);
  const [successMessage, setSuccessMessage] =
    useState<string | null>(null);

  const resetMediaEditor = useCallback(() => {
    setEditingMediaId(null);
    setMediaForm(emptyMediaForm);
  }, []);

  const loadMovie = useCallback(
    async (showLoadingState = true) => {
      if (showLoadingState) {
        setLoading(true);
      }

      setErrorMessage(null);

      try {
        if (isNewMovie) {
          setForm(emptyForm);
          setSelectedCategoryIds([]);
          setPrimaryCategoryId(null);
          setMediaItems([]);
          setMediaCount(0);
          setConfirmMovieArchive(false);
          setConfirmMediaArchiveId(null);
          resetMediaEditor();
          return;
        }

        const response = await adminFetch(
          `/api/admin/movies/${movieId}`,
          {
            cache: "no-store",
          },
        );

        if (!response.ok) {
          throw new Error(
            await getApiErrorMessage(
              response,
              "The movie could not be loaded.",
            ),
          );
        }

        const payload =
          (await response.json()) as MovieDetailResponse;
        const movie = payload.movie;

        if (!movie) {
          throw new Error("The movie could not be loaded.");
        }

        setForm({
          title: movie.title,
          releaseYear: movie.releaseYear,
          posterUrl: movie.posterUrl,
          difficulty: movie.difficulty,
          publicationStatus: movie.publicationStatus,
          licensingStatus: movie.licensingStatus,
        });
        setSelectedCategoryIds(movie.categoryIds ?? []);
        setPrimaryCategoryId(
          movie.primaryCategoryId ?? null,
        );
        setMediaCount(movie.mediaCount);
        setMediaItems(movie.mediaItems ?? []);
      } catch (error) {
        console.error("Unable to load movie:", error);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "The movie could not be loaded.",
        );
      } finally {
        if (showLoadingState) {
          setLoading(false);
        }
      }
    },
    [isNewMovie, movieId, resetMediaEditor],
  );

  const loadCategories = useCallback(async () => {
    setCategoryLoading(true);

    try {
      const response = await adminFetch("/api/admin/categories", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(
          await getApiErrorMessage(
            response,
            "The categories could not be loaded.",
          ),
        );
      }

      const payload =
        (await response.json()) as CategoryListResponse;
      setAvailableCategories(payload.categories ?? []);
    } catch (error) {
      console.error("Unable to load categories:", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The categories could not be loaded.",
      );
    } finally {
      setCategoryLoading(false);
    }
  }, []);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void loadMovie();
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, [loadMovie]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void loadCategories();
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, [loadCategories]);

  useEffect(() => {
    const nextMessage = consumeSuccessMessage();

    if (!nextMessage) {
      return;
    }

    const messageTimer = window.setTimeout(() => {
      setSuccessMessage(nextMessage);
    }, 0);

    return () => window.clearTimeout(messageTimer);
  }, [movieId]);

  function updateField<Key extends keyof MovieForm>(
    key: Key,
    value: MovieForm[Key],
  ) {
    setSuccessMessage(null);
    setConfirmMovieArchive(false);

    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function updateMediaField<Key extends keyof MediaForm>(
    key: Key,
    value: MediaForm[Key],
  ) {
    setSuccessMessage(null);
    setConfirmMediaArchiveId(null);

    setMediaForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function beginCreateMedia() {
    setSuccessMessage(null);
    setConfirmMediaArchiveId(null);
    setEditingMediaId(null);
    setMediaForm(emptyMediaForm);
  }

  function beginEditMedia(media: MovieMedia) {
    setSuccessMessage(null);
    setConfirmMediaArchiveId(null);
    setEditingMediaId(media.id);
    setMediaForm(createMediaFormFromItem(media));
  }

  function toggleCategory(categoryId: string) {
    setSuccessMessage(null);
    setConfirmMovieArchive(false);

    setSelectedCategoryIds((current) => {
      const next = current.includes(categoryId)
        ? current.filter((id) => id !== categoryId)
        : [...current, categoryId];

      setPrimaryCategoryId((currentPrimary) => {
        if (next.length === 0) {
          return null;
        }

        if (
          currentPrimary &&
          next.includes(currentPrimary)
        ) {
          return currentPrimary;
        }

        return next[0];
      });

      return next;
    });
  }

  function updatePrimaryCategory(categoryId: string) {
    setSuccessMessage(null);
    setPrimaryCategoryId(categoryId);
  }

  async function saveMovie() {
    if (!form.title.trim()) {
      setErrorMessage("A movie title is required.");
      return;
    }

    const releaseYear =
      form.releaseYear.trim() === ""
        ? null
        : Number(form.releaseYear);

    if (
      releaseYear !== null &&
      (!Number.isInteger(releaseYear) ||
        releaseYear < 1800 ||
        releaseYear > 2200)
    ) {
      setErrorMessage("Enter a valid release year.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await adminFetch(
        isNewMovie
          ? "/api/admin/movies"
          : `/api/admin/movies/${movieId}`,
        {
          method: isNewMovie ? "POST" : "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(form),
        },
      );

      if (!response.ok) {
        throw new Error(
          await getApiErrorMessage(
            response,
            isNewMovie
              ? "The movie could not be created."
              : "The movie could not be saved.",
          ),
        );
      }

      if (isNewMovie) {
        const payload = (await response.json()) as {
          movieId?: string;
        };

        if (!payload.movieId) {
          throw new Error(
            "The movie could not be created.",
          );
        }

        storeSuccessMessage("Movie created successfully.");
        router.replace(`/admin/movies/${payload.movieId}`);
        return;
      }

      setConfirmMovieArchive(false);
      setSuccessMessage("Movie saved successfully.");
      await loadMovie(false);
    } catch (error) {
      console.error("Unable to save movie:", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : isNewMovie
            ? "The movie could not be created."
            : "The movie could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function archiveMovie() {
    setArchiving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await adminFetch(
        `/api/admin/movies/${movieId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...form,
            publicationStatus: "archived",
          }),
        },
      );

      if (!response.ok) {
        throw new Error(
          await getApiErrorMessage(
            response,
            "The movie could not be archived.",
          ),
        );
      }

      setForm((current) => ({
        ...current,
        publicationStatus: "archived",
      }));
      setConfirmMovieArchive(false);
      setSuccessMessage("Movie archived successfully.");
      await loadMovie(false);
    } catch (error) {
      console.error("Unable to archive movie:", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The movie could not be archived.",
      );
    } finally {
      setArchiving(false);
    }
  }

  async function saveMedia() {
    if (isNewMovie) {
      setErrorMessage(
        "Create the movie before adding clues.",
      );
      return;
    }

    setMediaSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await adminFetch(
        editingMediaId
          ? `/api/admin/movies/${movieId}/media/${editingMediaId}`
          : `/api/admin/movies/${movieId}/media`,
        {
          method: editingMediaId ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(mediaForm),
        },
      );

      if (!response.ok) {
        throw new Error(
          await getApiErrorMessage(
            response,
            editingMediaId
              ? "The clue could not be saved."
              : "The clue could not be created.",
          ),
        );
      }

      setSuccessMessage(
        editingMediaId
          ? "Clue updated successfully."
          : "Clue created successfully.",
      );
      setConfirmMediaArchiveId(null);
      resetMediaEditor();
      await loadMovie(false);
    } catch (error) {
      console.error("Unable to save clue:", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : editingMediaId
            ? "The clue could not be saved."
            : "The clue could not be created.",
      );
    } finally {
      setMediaSaving(false);
    }
  }

  async function wireAutomaticClip() {
    if (isNewMovie) {
      setErrorMessage(
        "Create the movie before wiring an automatic clip.",
      );
      return;
    }

    if (!mediaForm.sourceUrl.trim()) {
      setErrorMessage(
        "Add a source URL before wiring an automatic clip.",
      );
      return;
    }

    setAutoClipSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await adminFetch(
        `/api/admin/movies/${movieId}/auto-clip`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...mediaForm,
            mediaId: editingMediaId,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(
          await getApiErrorMessage(
            response,
            "The automatic clip could not be wired.",
          ),
        );
      }

      const payload = (await response.json()) as {
        mediaId?: string;
        verification?: {
          sourceDurationSeconds?: number;
        };
      };

      setSuccessMessage(
        payload.verification?.sourceDurationSeconds
          ? `Automatic clip verified and wired successfully. Source length: ${payload.verification.sourceDurationSeconds}s.`
          : "Automatic clip verified and wired successfully.",
      );
      setConfirmMediaArchiveId(null);
      resetMediaEditor();
      await loadMovie(false);
    } catch (error) {
      console.error(
        "Unable to wire automatic clip:",
        error,
      );
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The automatic clip could not be wired.",
      );
    } finally {
      setAutoClipSaving(false);
    }
  }

  async function saveCategories() {
    if (isNewMovie) {
      setErrorMessage(
        "Create the movie before assigning categories.",
      );
      return;
    }

    const nextPrimaryCategoryId =
      selectedCategoryIds.length === 0
        ? null
        : selectedCategoryIds.includes(
              primaryCategoryId ?? "",
            )
          ? primaryCategoryId
          : selectedCategoryIds[0];

    setCategorySaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await adminFetch(
        `/api/admin/movies/${movieId}/categories`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            categoryIds: selectedCategoryIds,
            primaryCategoryId: nextPrimaryCategoryId,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(
          await getApiErrorMessage(
            response,
            "The categories could not be saved.",
          ),
        );
      }

      setPrimaryCategoryId(nextPrimaryCategoryId);
      setSuccessMessage("Categories saved successfully.");
      await loadMovie(false);
    } catch (error) {
      console.error("Unable to save categories:", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The categories could not be saved.",
      );
    } finally {
      setCategorySaving(false);
    }
  }

  async function archiveMedia(media: MovieMedia) {
    setArchivingMediaId(media.id);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await adminFetch(
        `/api/admin/movies/${movieId}/media/${media.id}`,
        {
          method: "DELETE",
        },
      );

      if (!response.ok) {
        throw new Error(
          await getApiErrorMessage(
            response,
            "The clue could not be archived.",
          ),
        );
      }

      if (editingMediaId === media.id) {
        resetMediaEditor();
      }

      setConfirmMediaArchiveId(null);
      setSuccessMessage("Clue archived successfully.");
      await loadMovie(false);
    } catch (error) {
      console.error("Unable to archive clue:", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The clue could not be archived.",
      );
    } finally {
      setArchivingMediaId(null);
    }
  }

  if (loading) {
    return (
      <>
        <AdminHeader
          title={isNewMovie ? "Add Movie" : "Movie Editor"}
          description={
            isNewMovie
              ? "Preparing a new Movie Buff record."
              : "Loading the selected movie from Supabase."
          }
        />

        <div className="flex min-h-[60vh] flex-col items-center justify-center p-8">
          <LoaderCircle className="h-10 w-10 animate-spin text-violet-300" />
          <p className="mt-4 font-black text-white">
            {isNewMovie ? "Preparing movie form" : "Loading movie"}
          </p>
        </div>
      </>
    );
  }

  const selectedCategories = availableCategories.filter(
    (category) =>
      selectedCategoryIds.includes(category.id),
  );

  return (
    <>
      <AdminHeader
        title={
          isNewMovie
            ? "Add Movie"
            : form.title || "Movie Editor"
        }
        description={
          isNewMovie
            ? "Create a new Movie Buff content record."
            : "Edit the selected Movie Buff content record."
        }
      />

      <div className="space-y-6 p-5 sm:p-8">
        <button
          type="button"
          onClick={() => router.push("/admin/movies")}
          className="inline-flex items-center gap-2 text-sm font-black text-zinc-400 transition hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Movie Library
        </button>

        {errorMessage ? (
          <section className="flex gap-3 rounded-2xl border border-red-400/20 bg-red-400/10 p-5 text-red-200">
            <AlertCircle className="h-5 w-5 shrink-0" />

            <div>
              <p className="font-black">Movie editor error</p>
              <p className="mt-1 text-sm text-red-200/70">
                {errorMessage}
              </p>
            </div>
          </section>
        ) : null}

        {successMessage ? (
          <section className="flex gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-5 text-emerald-200">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <p className="font-black">{successMessage}</p>
          </section>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[280px_1fr]">
          <aside className="space-y-5 rounded-3xl border border-white/10 bg-zinc-950 p-5">
            <div
              className="flex aspect-[2/3] items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/30 to-fuchsia-500/20 bg-cover bg-center text-violet-200"
              style={
                form.posterUrl
                  ? {
                      backgroundImage: `url("${form.posterUrl}")`,
                    }
                  : undefined
              }
            >
              {!form.posterUrl ? (
                <Film className="h-12 w-12" />
              ) : null}
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-2xl font-black text-white">
                {mediaCount}
              </p>
              <p className="text-xs text-zinc-500">
                Active media
              </p>
            </div>

            <p className="break-all text-xs text-zinc-600">
              {isNewMovie
                ? "ID: assigned after creation"
                : `ID: ${movieId}`}
            </p>
          </aside>

          <div className="space-y-6">
            <section className="rounded-3xl border border-white/10 bg-zinc-950 p-6">
              <h2 className="text-xl font-black text-white">
                Overview
              </h2>

              <div className="mt-6 grid gap-5 md:grid-cols-2">
                <label className="md:col-span-2">
                  <span className="mb-2 block text-sm font-black text-zinc-300">
                    Movie title
                  </span>

                  <input
                    value={form.title}
                    onChange={(event) =>
                      updateField("title", event.target.value)
                    }
                    className="h-12 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-white outline-none focus:border-violet-400"
                  />
                </label>

                <label>
                  <span className="mb-2 block text-sm font-black text-zinc-300">
                    Release year
                  </span>

                  <input
                    value={form.releaseYear}
                    onChange={(event) =>
                      updateField(
                        "releaseYear",
                        event.target.value,
                      )
                    }
                    type="number"
                    min="1800"
                    max="2200"
                    className="h-12 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-white outline-none focus:border-violet-400"
                  />
                </label>

                <label>
                  <span className="mb-2 block text-sm font-black text-zinc-300">
                    Poster URL
                  </span>

                  <input
                    value={form.posterUrl}
                    onChange={(event) =>
                      updateField(
                        "posterUrl",
                        event.target.value,
                      )
                    }
                    className="h-12 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-white outline-none focus:border-violet-400"
                  />
                </label>
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-zinc-950 p-6">
              <h2 className="text-xl font-black text-white">
                Gameplay
              </h2>

              <div className="mt-6 grid gap-5 md:grid-cols-3">
                <label>
                  <span className="mb-2 block text-sm font-black text-zinc-300">
                    Difficulty
                  </span>

                  <select
                    value={form.difficulty}
                    onChange={(event) =>
                      updateField(
                        "difficulty",
                        event.target.value,
                      )
                    }
                    className="h-12 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-white outline-none focus:border-violet-400"
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                    <option value="expert">Expert</option>
                  </select>
                </label>

                <label>
                  <span className="mb-2 block text-sm font-black text-zinc-300">
                    Publication
                  </span>

                  <select
                    value={form.publicationStatus}
                    onChange={(event) =>
                      updateField(
                        "publicationStatus",
                        event.target.value,
                      )
                    }
                    className="h-12 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-white outline-none focus:border-violet-400"
                  >
                    <option value="draft">Draft</option>
                    <option value="review">Review</option>
                    <option value="published">Published</option>
                    <option value="archived">Archived</option>
                  </select>
                </label>

                <label>
                  <span className="mb-2 block text-sm font-black text-zinc-300">
                    Licensing
                  </span>

                  <select
                    value={form.licensingStatus}
                    onChange={(event) =>
                      updateField(
                        "licensingStatus",
                        event.target.value,
                      )
                    }
                    className="h-12 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-white outline-none focus:border-violet-400"
                  >
                    <option value="pending">Pending</option>
                    <option value="licensed">Licensed</option>
                    <option value="public_domain">
                      Public Domain
                    </option>
                    <option value="promotional">
                      Promotional
                    </option>
                    <option value="original">Original</option>
                    <option value="user_connected">
                      User Connected
                    </option>
                    <option value="restricted">
                      Restricted
                    </option>
                  </select>
                </label>
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-zinc-950 p-6">
              <h2 className="text-xl font-black text-white">
                Categories
              </h2>

              <p className="mt-1 text-sm text-zinc-500">
                Assign one or more categories to power library filtering and room setup. One category is used as the primary label.
              </p>

              {isNewMovie ? (
                <div className="mt-6 rounded-2xl border border-dashed border-white/10 bg-black/30 p-6 text-sm text-zinc-400">
                  Create the movie record first. Category assignment unlocks as soon as the movie has a real ID.
                </div>
              ) : categoryLoading ? (
                <div className="mt-6 flex min-h-32 items-center justify-center rounded-2xl border border-white/10 bg-black/30">
                  <LoaderCircle className="h-6 w-6 animate-spin text-violet-300" />
                </div>
              ) : availableCategories.length === 0 ? (
                <div className="mt-6 rounded-2xl border border-dashed border-white/10 bg-black/30 p-6 text-sm text-zinc-400">
                  No categories are available yet.
                </div>
              ) : (
                <>
                  <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {availableCategories.map((category) => {
                      const isSelected =
                        selectedCategoryIds.includes(
                          category.id,
                        );

                      return (
                        <label
                          key={category.id}
                          className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${
                            isSelected
                              ? "border-violet-400/40 bg-violet-400/10"
                              : "border-white/10 bg-black/30 hover:border-white/20"
                          }`}
                        >
                          <input
                            checked={isSelected}
                            onChange={() =>
                              toggleCategory(category.id)
                            }
                            type="checkbox"
                            className="mt-1 h-4 w-4 rounded border-white/20 bg-black"
                          />

                          <div>
                            <p className="font-black text-white">
                              {category.name}
                            </p>

                            <p className="mt-1 text-sm text-zinc-500">
                              {category.description ||
                                category.slug}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>

                  {selectedCategories.length > 0 ? (
                    <label className="mt-6 block">
                      <span className="mb-2 block text-sm font-black text-zinc-300">
                        Primary category
                      </span>

                      <select
                        value={
                          primaryCategoryId ??
                          selectedCategories[0]?.id ??
                          ""
                        }
                        onChange={(event) =>
                          updatePrimaryCategory(
                            event.target.value,
                          )
                        }
                        className="h-12 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-white outline-none focus:border-violet-400"
                      >
                        {selectedCategories.map((category) => (
                          <option
                            key={category.id}
                            value={category.id}
                          >
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <p className="mt-6 text-sm text-zinc-500">
                      Select at least one category to set a primary category.
                    </p>
                  )}

                  <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-white/10 bg-zinc-950/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-zinc-500">
                      The primary category is used as the main library label for this movie.
                    </p>

                    <button
                      type="button"
                      onClick={() => void saveCategories()}
                      disabled={categorySaving}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-violet-500 px-5 text-sm font-black text-white disabled:opacity-50"
                    >
                      {categorySaving ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      Save categories
                    </button>
                  </div>
                </>
              )}
            </section>

            <section className="rounded-3xl border border-white/10 bg-zinc-950 p-6">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <h2 className="font-black text-white">
                    {isNewMovie
                      ? "Create movie record"
                      : "Save movie changes"}
                  </h2>

                  <p className="mt-1 text-sm text-zinc-500">
                    {isNewMovie
                      ? "Create the movie first, then add media and categories."
                      : "Changes are written directly to the Movie Buff content store."}
                  </p>
                </div>

                <div className="flex gap-3">
                  {!isNewMovie ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSuccessMessage(null);
                        setConfirmMovieArchive(true);
                      }}
                      disabled={archiving || saving}
                      className="inline-flex h-12 items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-400/10 px-5 text-sm font-black text-amber-300 disabled:opacity-50"
                    >
                      {archiving ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <Archive className="h-4 w-4" />
                      )}
                      Archive
                    </button>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => void saveMovie()}
                    disabled={saving || archiving}
                    className="inline-flex h-12 items-center gap-2 rounded-xl bg-violet-500 px-6 text-sm font-black text-white disabled:opacity-50"
                  >
                    {saving ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : isNewMovie ? (
                      <Plus className="h-4 w-4" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    {isNewMovie ? "Create movie" : "Save movie"}
                  </button>
                </div>
              </div>

              {!isNewMovie && confirmMovieArchive ? (
                <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4">
                  <p className="text-sm font-black text-amber-200">
                    Archive this movie?
                  </p>
                  <p className="mt-1 text-sm text-amber-100/80">
                    The movie will stay in the content store, but it will be marked as archived and removed from active rotation.
                  </p>

                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => void archiveMovie()}
                      disabled={archiving || saving}
                      className="inline-flex h-11 items-center gap-2 rounded-xl bg-amber-500 px-4 text-sm font-black text-black disabled:opacity-50"
                    >
                      {archiving ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <Archive className="h-4 w-4" />
                      )}
                      Confirm archive
                    </button>

                    <button
                      type="button"
                      onClick={() => setConfirmMovieArchive(false)}
                      disabled={archiving}
                      className="inline-flex h-11 items-center rounded-xl border border-white/10 px-4 text-sm font-black text-zinc-300 transition hover:text-white disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </section>

            <section className="rounded-3xl border border-white/10 bg-zinc-950 p-6">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <h2 className="text-xl font-black text-white">
                    Media & Clues
                  </h2>

                  <p className="mt-1 text-sm text-zinc-500">
                    Build the prompts, media clips, and fallback clues used during rounds.
                  </p>
                </div>

                {!isNewMovie ? (
                  <button
                    type="button"
                    onClick={beginCreateMedia}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-black text-black transition hover:bg-zinc-200"
                  >
                    <Plus className="h-4 w-4" />
                    Add clue
                  </button>
                ) : null}
              </div>

              {isNewMovie ? (
                <div className="mt-6 rounded-2xl border border-dashed border-white/10 bg-black/30 p-6 text-sm text-zinc-400">
                  Create the movie record first. The clue editor unlocks as soon as the movie has a real ID.
                </div>
              ) : (
                <div className="mt-6 grid gap-6 xl:grid-cols-[340px_1fr]">
                  <div className="space-y-3">
                    {mediaItems.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-white/10 bg-black/30 p-5 text-center">
                        <Clapperboard className="mx-auto h-7 w-7 text-violet-300" />
                        <p className="mt-3 font-black text-white">
                          No clues yet
                        </p>
                        <p className="mt-2 text-sm text-zinc-500">
                          Add a trivia prompt, quote, image, poster, or media clip for this movie.
                        </p>
                      </div>
                    ) : (
                      mediaItems.map((media) => (
                        <article
                          key={media.id}
                          className={`rounded-2xl border p-4 transition ${
                            editingMediaId === media.id
                              ? "border-violet-400/50 bg-violet-400/10"
                              : "border-white/10 bg-black/30"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full border border-violet-400/20 bg-violet-400/10 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-violet-200">
                                  {formatLabel(media.mediaType)}
                                </span>

                                <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-zinc-400">
                                  {formatLabel(media.roundPosition)}
                                </span>

                                {media.isHidden ? (
                                  <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-amber-300">
                                    Hidden
                                  </span>
                                ) : null}
                              </div>

                              <p className="mt-3 line-clamp-3 text-sm font-semibold text-white">
                                {getMediaSummary(media)}
                              </p>

                              <p className="mt-2 text-xs text-zinc-500">
                                Difficulty {formatLabel(media.difficulty)} • Sort {media.sortOrder}
                                {media.durationSeconds
                                  ? ` • ${media.durationSeconds}s`
                                  : ""}
                              </p>
                            </div>
                          </div>

                          <div className="mt-4 flex gap-2">
                            <button
                              type="button"
                              onClick={() => beginEditMedia(media)}
                              className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 px-3 text-sm font-black text-zinc-300 transition hover:border-violet-400/40 hover:text-white"
                            >
                              <PencilLine className="h-4 w-4" />
                              Edit
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setSuccessMessage(null);
                                setConfirmMediaArchiveId(media.id);
                              }}
                              disabled={archivingMediaId === media.id}
                              className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-400/20 bg-red-400/10 px-3 text-sm font-black text-red-300 disabled:opacity-50"
                            >
                              {archivingMediaId === media.id ? (
                                <LoaderCircle className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                              Archive
                            </button>
                          </div>

                          {confirmMediaArchiveId === media.id ? (
                            <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 p-4">
                              <p className="text-sm font-black text-red-200">
                                Archive this {formatLabel(media.mediaType).toLowerCase()} clue?
                              </p>
                              <p className="mt-1 text-sm text-red-100/80">
                                This removes the clue from active rotation without deleting the movie.
                              </p>

                              <div className="mt-4 flex flex-wrap gap-3">
                                <button
                                  type="button"
                                  onClick={() => void archiveMedia(media)}
                                  disabled={archivingMediaId === media.id}
                                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-red-500 px-4 text-sm font-black text-white disabled:opacity-50"
                                >
                                  {archivingMediaId === media.id ? (
                                    <LoaderCircle className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4" />
                                  )}
                                  Confirm archive
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    setConfirmMediaArchiveId(null)
                                  }
                                  disabled={
                                    archivingMediaId === media.id
                                  }
                                  className="inline-flex h-10 items-center rounded-xl border border-white/10 px-4 text-sm font-black text-zinc-300 transition hover:text-white disabled:opacity-50"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </article>
                      ))
                    )}
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-black text-white">
                          {editingMediaId ? "Edit clue" : "Add clue"}
                        </h3>

                        <p className="mt-1 text-sm text-zinc-500">
                          Media clues can be video, audio, image, poster, quote, trivia, year, or text.
                        </p>
                      </div>

                      {editingMediaId ? (
                        <button
                          type="button"
                          onClick={beginCreateMedia}
                          className="text-sm font-black text-zinc-400 transition hover:text-white"
                        >
                          Cancel edit
                        </button>
                      ) : null}
                    </div>

                    <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                      <label>
                        <span className="mb-2 block text-sm font-black text-zinc-300">
                          Clue type
                        </span>

                        <select
                          value={mediaForm.mediaType}
                          onChange={(event) =>
                            updateMediaField(
                              "mediaType",
                              event.target.value,
                            )
                          }
                          className="h-12 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-white outline-none focus:border-violet-400"
                        >
                          <option value="video">Video</option>
                          <option value="audio">Audio</option>
                          <option value="image">Image</option>
                          <option value="poster">Poster</option>
                          <option value="quote">Quote</option>
                          <option value="trivia">Trivia</option>
                          <option value="year">Year</option>
                          <option value="text">Text</option>
                        </select>
                      </label>

                      <label>
                        <span className="mb-2 block text-sm font-black text-zinc-300">
                          Round position
                        </span>

                        <select
                          value={mediaForm.roundPosition}
                          onChange={(event) =>
                            updateMediaField(
                              "roundPosition",
                              event.target.value,
                            )
                          }
                          className="h-12 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-white outline-none focus:border-violet-400"
                        >
                          <option value="any">Any</option>
                          <option value="beginning">Beginning</option>
                          <option value="middle">Middle</option>
                          <option value="ending">Ending</option>
                        </select>
                      </label>

                      <label>
                        <span className="mb-2 block text-sm font-black text-zinc-300">
                          Sort order
                        </span>

                        <input
                          value={mediaForm.sortOrder}
                          onChange={(event) =>
                            updateMediaField(
                              "sortOrder",
                              event.target.value,
                            )
                          }
                          type="number"
                          className="h-12 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-white outline-none focus:border-violet-400"
                        />
                      </label>

                      <label>
                        <span className="mb-2 block text-sm font-black text-zinc-300">
                          Difficulty
                        </span>

                        <select
                          value={mediaForm.difficulty}
                          onChange={(event) =>
                            updateMediaField(
                              "difficulty",
                              event.target.value,
                            )
                          }
                          className="h-12 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-white outline-none focus:border-violet-400"
                        >
                          <option value="easy">Easy</option>
                          <option value="medium">Medium</option>
                          <option value="hard">Hard</option>
                          <option value="expert">Expert</option>
                        </select>
                      </label>

                      <label>
                        <span className="mb-2 block text-sm font-black text-zinc-300">
                          Licensing
                        </span>

                        <select
                          value={mediaForm.licensingStatus}
                          onChange={(event) =>
                            updateMediaField(
                              "licensingStatus",
                              event.target.value,
                            )
                          }
                          className="h-12 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-white outline-none focus:border-violet-400"
                        >
                          <option value="pending">Pending</option>
                          <option value="licensed">Licensed</option>
                          <option value="public_domain">
                            Public Domain
                          </option>
                          <option value="promotional">
                            Promotional
                          </option>
                          <option value="original">Original</option>
                          <option value="user_connected">
                            User Connected
                          </option>
                          <option value="restricted">
                            Restricted
                          </option>
                        </select>
                      </label>

                      <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/40 px-4 py-3">
                        <input
                          checked={mediaForm.isHidden}
                          onChange={(event) =>
                            updateMediaField(
                              "isHidden",
                              event.target.checked,
                            )
                          }
                          type="checkbox"
                          className="h-4 w-4 rounded border-white/20 bg-black"
                        />
                        <span className="text-sm font-black text-zinc-300">
                          Hidden from normal rotation
                        </span>
                      </label>

                      <label className="md:col-span-2 xl:col-span-3">
                        <span className="mb-2 block text-sm font-black text-zinc-300">
                          Clue title
                        </span>

                        <input
                          value={mediaForm.title}
                          onChange={(event) =>
                            updateMediaField(
                              "title",
                              event.target.value,
                            )
                          }
                          className="h-12 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-white outline-none focus:border-violet-400"
                        />
                      </label>

                      <label className="md:col-span-2 xl:col-span-3">
                        <span className="mb-2 block text-sm font-black text-zinc-300">
                          Prompt
                        </span>

                        <textarea
                          value={mediaForm.prompt}
                          onChange={(event) =>
                            updateMediaField(
                              "prompt",
                              event.target.value,
                            )
                          }
                          rows={3}
                          className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none focus:border-violet-400"
                        />
                      </label>

                      <label className="md:col-span-2 xl:col-span-3">
                        <span className="mb-2 block text-sm font-black text-zinc-300">
                          Quote text
                        </span>

                        <textarea
                          value={mediaForm.quoteText}
                          onChange={(event) =>
                            updateMediaField(
                              "quoteText",
                              event.target.value,
                            )
                          }
                          rows={3}
                          className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none focus:border-violet-400"
                        />
                      </label>

                      <label className="md:col-span-2 xl:col-span-3">
                        <span className="mb-2 block text-sm font-black text-zinc-300">
                          Media URL
                        </span>

                        <input
                          value={mediaForm.mediaUrl}
                          onChange={(event) =>
                            updateMediaField(
                              "mediaUrl",
                              event.target.value,
                            )
                          }
                          placeholder="Required for video, audio, image, and poster clues"
                          className="h-12 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-white outline-none placeholder:text-zinc-600 focus:border-violet-400"
                        />

                        <p className="mt-2 text-xs text-zinc-600">
                          For generator-backed movie clips, leave this alone and use the automatic clip button below. The app will wire a temporary playback route for you.
                        </p>
                      </label>

                      <label className="md:col-span-2 xl:col-span-3">
                        <span className="mb-2 block text-sm font-black text-zinc-300">
                          Thumbnail URL
                        </span>

                        <input
                          value={mediaForm.thumbnailUrl}
                          onChange={(event) =>
                            updateMediaField(
                              "thumbnailUrl",
                              event.target.value,
                            )
                          }
                          className="h-12 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-white outline-none focus:border-violet-400"
                        />
                      </label>

                      <label>
                        <span className="mb-2 block text-sm font-black text-zinc-300">
                          Start seconds
                        </span>

                        <input
                          value={mediaForm.startSeconds}
                          onChange={(event) =>
                            updateMediaField(
                              "startSeconds",
                              event.target.value,
                            )
                          }
                          type="number"
                          step="0.01"
                          min="0"
                          className="h-12 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-white outline-none focus:border-violet-400"
                        />
                      </label>

                      <label>
                        <span className="mb-2 block text-sm font-black text-zinc-300">
                          End seconds
                        </span>

                        <input
                          value={mediaForm.endSeconds}
                          onChange={(event) =>
                            updateMediaField(
                              "endSeconds",
                              event.target.value,
                            )
                          }
                          type="number"
                          step="0.01"
                          min="0"
                          className="h-12 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-white outline-none focus:border-violet-400"
                        />
                      </label>

                      <label className="md:col-span-2 xl:col-span-3">
                        <span className="mb-2 block text-sm font-black text-zinc-300">
                          Source name
                        </span>

                        <input
                          value={mediaForm.sourceName}
                          onChange={(event) =>
                            updateMediaField(
                              "sourceName",
                              event.target.value,
                            )
                          }
                          className="h-12 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-white outline-none focus:border-violet-400"
                        />
                      </label>

                      <label className="md:col-span-2 xl:col-span-3">
                        <span className="mb-2 block text-sm font-black text-zinc-300">
                          Source URL
                        </span>

                        <input
                          value={mediaForm.sourceUrl}
                          onChange={(event) =>
                            updateMediaField(
                              "sourceUrl",
                              event.target.value,
                            )
                          }
                          className="h-12 w-full rounded-xl border border-white/10 bg-black/40 px-4 text-white outline-none focus:border-violet-400"
                        />
                      </label>

                      <label className="md:col-span-2 xl:col-span-3">
                        <span className="mb-2 block text-sm font-black text-zinc-300">
                          Attribution
                        </span>

                        <textarea
                          value={mediaForm.attribution}
                          onChange={(event) =>
                            updateMediaField(
                              "attribution",
                              event.target.value,
                            )
                          }
                          rows={2}
                          className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none focus:border-violet-400"
                        />
                      </label>
                    </div>

                    <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-white/10 bg-zinc-950/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-zinc-500">
                        Save the clue after each change. For source-based movie clips, use automatic clip wiring to verify the source and generate round playback on demand instead of storing a permanent rendered file.
                      </p>

                      <div className="flex flex-col gap-3 sm:flex-row">
                        <button
                          type="button"
                          onClick={() => void wireAutomaticClip()}
                          disabled={autoClipSaving}
                          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-5 text-sm font-black text-emerald-200 disabled:opacity-50"
                        >
                          {autoClipSaving ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                          ) : (
                            <Clapperboard className="h-4 w-4" />
                          )}
                          Verify source + wire auto clip
                        </button>

                        <button
                          type="button"
                          onClick={() => void saveMedia()}
                          disabled={mediaSaving || autoClipSaving}
                          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-violet-500 px-5 text-sm font-black text-white disabled:opacity-50"
                        >
                          {mediaSaving ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                          ) : editingMediaId ? (
                            <Save className="h-4 w-4" />
                          ) : (
                            <Plus className="h-4 w-4" />
                          )}
                          {editingMediaId ? "Save clue" : "Create clue"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        </section>
      </div>
    </>
  );
}
