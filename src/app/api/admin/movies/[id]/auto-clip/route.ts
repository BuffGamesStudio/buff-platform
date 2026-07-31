import { NextResponse } from "next/server";

import {
  createAdminErrorResponse,
  requireAdminRequest,
} from "@/lib/server/adminAuth";
import {
  buildGeneratedPreviewMediaUrl,
  FINAL_CLIP_DURATION_SECONDS,
  verifyGeneratedClipSource,
} from "@/lib/server/movieClipper";
import {
  createAdminMovieMedia,
  getAdminMovie,
  updateAdminMovieMedia,
} from "@/lib/server/movieAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type AutoClipBody = {
  mediaId?: string | null;
  mediaType?: string;
  roundPosition?: string;
  title?: string;
  prompt?: string;
  quoteText?: string;
  difficulty?: string;
  licensingStatus?: string;
  sourceName?: string;
  sourceUrl?: string;
  attribution?: string;
  sortOrder?: string;
  isHidden?: boolean;
};

function deriveSourceName(
  currentValue: string | undefined,
  sourceUrl: string,
) {
  if (currentValue?.trim()) {
    return currentValue.trim();
  }

  try {
    const url = new URL(sourceUrl);

    if (url.hostname === "archive.org") {
      return "Internet Archive";
    }

    return url.hostname;
  } catch {
    return "Generated source";
  }
}

export async function POST(
  request: Request,
  context: RouteContext,
) {
  try {
    await requireAdminRequest(request);
    const { id: movieId } = await context.params;
    const body = (await request.json()) as AutoClipBody;
    const movie = await getAdminMovie(movieId);
    const clipType =
      body.mediaType?.toLowerCase() === "audio"
        ? "audio"
        : "video";
    const sourceUrl = body.sourceUrl?.trim() ?? "";

    if (!sourceUrl) {
      throw new Error(
        "Add a source URL before wiring an automatic clip.",
      );
    }

    const verification =
      await verifyGeneratedClipSource(
        sourceUrl,
        clipType,
      );
    const existingMediaId =
      body.mediaId?.trim() || null;
    const prompt =
      body.prompt?.trim() ||
      "Name the movie from this generated clip.";
    const title =
      body.title?.trim() ||
      `${movie.title} generated ${clipType} clue`;
    const sourceName = deriveSourceName(
      body.sourceName,
      sourceUrl,
    );
    const sortOrder =
      body.sortOrder?.trim() ||
      String(movie.mediaItems.length + 1);
    const playbackUrl = existingMediaId
      ? buildGeneratedPreviewMediaUrl(
          existingMediaId,
        )
      : "/api/movie-buff/generated/pending";
    const payload = {
      attribution:
        body.attribution?.trim() ||
        "Generated on demand from the verified source master. Opening title cards and end credits are intentionally avoided when possible.",
      difficulty:
        body.difficulty?.trim() ||
        movie.difficulty,
      endSeconds:
        String(FINAL_CLIP_DURATION_SECONDS),
      isHidden: body.isHidden === true,
      licensingStatus:
        body.licensingStatus?.trim() ||
        movie.licensingStatus,
      mediaType: clipType,
      mediaUrl: playbackUrl,
      prompt,
      quoteText: body.quoteText?.trim() || "",
      roundPosition:
        body.roundPosition?.trim() || "any",
      sortOrder,
      sourceName,
      sourceUrl,
      startSeconds: "0",
      thumbnailUrl: "",
      title,
    };

    let mediaId = existingMediaId;

    if (mediaId) {
      await updateAdminMovieMedia(
        movieId,
        mediaId,
        payload,
      );
    } else {
      mediaId = await createAdminMovieMedia(
        movieId,
        payload,
      );

      await updateAdminMovieMedia(
        movieId,
        mediaId,
        {
          ...payload,
          mediaUrl:
            buildGeneratedPreviewMediaUrl(
              mediaId,
            ),
        },
      );
    }

    const refreshedMovie = await getAdminMovie(
      movieId,
    );
    const mediaItem =
      refreshedMovie.mediaItems.find(
        (item) => item.id === mediaId,
      ) ?? null;

    return NextResponse.json({
      mediaId,
      mediaItem,
      verification,
    });
  } catch (error) {
    return createAdminErrorResponse(
      error,
      "The automatic clip could not be wired.",
      400,
    );
  }
}
