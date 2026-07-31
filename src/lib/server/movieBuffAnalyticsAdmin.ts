import "server-only";

import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import { getMovieBuffDifficultyLabel } from "@/lib/game/movieBuffPresentation";

type ContentMediaRow = {
  id: string;
  content_id: string;
  legacy_clip_id: string | null;
  media_type: string;
  round_position: string | null;
  difficulty: string;
  start_seconds: number | null;
  end_seconds: number | null;
  duration_seconds: number | null;
  is_active: boolean;
  is_hidden: boolean;
  source_url: string | null;
  title: string | null;
};

type ContentItemRow = {
  id: string;
  title: string;
  release_year: number | null;
  source_name: string | null;
  source_url: string | null;
  licensing_status: string;
  publication_status: string;
  is_active: boolean;
  metadata: Record<string, unknown> | null;
};

type ClipAnalyticsRow = {
  content_media_id: string;
  content_id: string;
  legacy_clip_id: string | null;
  total_plays: number;
  total_correct: number;
  total_wrong: number;
  total_hints_used: number;
  total_timeouts: number;
  total_load_success: number;
  total_load_failures: number;
  avg_answer_time_seconds: number;
  last_played_at: string | null;
  last_loaded_at: string | null;
  sample_size: number;
  difficulty_score: number;
  system_difficulty_label: string;
  quality_score: number;
  rotation_score: number;
  rotation_weight: number;
  admin_boost: number;
  status: string;
  quality_flags: string[] | null;
  updated_at: string;
};

type EventRow = {
  id: string;
  event_type: string;
  room_id: string | null;
  match_id: string | null;
  round_id: string | null;
  occurred_at: string;
  payload: Record<string, unknown> | null;
};

type LegacyMovieRow = {
  id: string;
  title: string;
  release_year: number | null;
  difficulty: string;
  is_active: boolean;
};

type LegacyClipRow = {
  id: string;
  movie_id: string;
  clip_type: string | null;
  media_url: string | null;
  source_url: string | null;
  licensing_status: string | null;
  is_active: boolean;
};

type LegacyClipEventRow = {
  event_type: string;
  legacy_clip_id: string | null;
  occurred_at: string;
  payload: Record<string, unknown> | null;
};

export type MovieBuffClipAdminRow = {
  contentMediaId: string;
  contentId: string;
  legacyClipId: string | null;
  movieTitle: string;
  releaseYear: number | null;
  sourceName: string | null;
  sourceUrl: string | null;
  licenseStatus: string;
  publicationStatus: string;
  movieIsActive: boolean;
  mediaType: string;
  section: string | null;
  targetDifficulty: string;
  clipStartSeconds: number | null;
  clipEndSeconds: number | null;
  clipDurationSeconds: number | null;
  clipTitle: string | null;
  clipIsActive: boolean;
  clipIsHidden: boolean;
  totalPlays: number;
  totalCorrect: number;
  totalWrong: number;
  totalHintsUsed: number;
  totalTimeouts: number;
  totalLoadSuccess: number;
  totalLoadFailures: number;
  sampleSize: number;
  confidenceFactor: number;
  avgAnswerTimeSeconds: number;
  correctRate: number;
  hintRate: number;
  difficultyScore: number;
  systemDifficultyLabel: string;
  qualityScore: number;
  rotationScore: number;
  rotationWeight: number;
  adminBoost: number;
  status: string;
  qualityFlags: string[];
  lastPlayedAt: string | null;
  lastLoadedAt: string | null;
  updatedAt: string | null;
};

export type MovieBuffAnalyticsSummary = {
  totalMovies: number;
  totalTrackedClips: number;
  playableClips: number;
  activeRotationClips: number;
  recentFailures7d: number;
  events24h: number;
};

export type MovieBuffMatchAnalytics = {
  recentEvents: EventRow[];
  eventCounts: Array<{
    eventType: string;
    count: number;
  }>;
  roomSummaries: Array<{
    roomId: string;
    totalEvents: number;
    roundsStarted: number;
    clipsStarted: number;
    answersSubmitted: number;
    failures: number;
    latestAt: string;
  }>;
};

function normalizeStringArray(
  value: unknown
) {
  if (Array.isArray(value)) {
    return value
      .map((entry) =>
        String(entry ?? "").trim()
      )
      .filter(Boolean);
  }

  return [];
}

function toNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? numeric
    : fallback;
}

function isMissingAnalyticsContentSchema(
  message: string | null | undefined,
) {
  const normalizedMessage =
    message?.toLowerCase() ?? "";

  return (
    (normalizedMessage.includes("content_media") ||
      normalizedMessage.includes("content_items") ||
      normalizedMessage.includes(
        "movie_buff_clip_analytics",
      )) &&
    (normalizedMessage.includes("schema cache") ||
      normalizedMessage.includes("does not exist"))
  );
}

async function listLegacyMovieBuffClipAdminRows(
  limit?: number
): Promise<MovieBuffClipAdminRow[]> {
  const [
    { data: moviesData, error: moviesError },
    { data: clipsData, error: clipsError },
  ] = await Promise.all([
    supabaseAdmin
      .from("movies")
      .select(
        "id, title, release_year, difficulty, is_active"
      ),
    supabaseAdmin
      .from("clips")
      .select(
        "id, movie_id, clip_type, media_url, source_url, licensing_status, is_active"
      ),
  ]);

  if (moviesError) {
    throw new Error(moviesError.message);
  }

  if (clipsError) {
    throw new Error(clipsError.message);
  }

  const movieById = new Map(
    (((moviesData ?? []) as unknown) as LegacyMovieRow[]).map(
      (row) => [row.id, row]
    )
  );
  const typedClips =
    (((clipsData ?? []) as unknown) as LegacyClipRow[]);
  const legacyClipIds = typedClips.map(
    (row) => row.id
  );

  const { data: eventData, error: eventError } =
    legacyClipIds.length > 0
      ? await supabaseAdmin
          .from("movie_buff_round_events")
          .select(
            "event_type, legacy_clip_id, occurred_at, payload"
          )
          .in("legacy_clip_id", legacyClipIds)
      : { data: [], error: null };

  if (eventError) {
    throw new Error(eventError.message);
  }

  const eventRows =
    (((eventData ?? []) as unknown) as LegacyClipEventRow[]);
  const eventsByLegacyClipId = new Map();

  for (const row of eventRows) {
    if (!row.legacy_clip_id) {
      continue;
    }

    const bucket =
      eventsByLegacyClipId.get(
        row.legacy_clip_id,
      ) ?? [];
    bucket.push(row);
    eventsByLegacyClipId.set(
      row.legacy_clip_id,
      bucket,
    );
  }

  let rows = typedClips
    .map((clipRow) => {
      const movieRow =
        movieById.get(clipRow.movie_id);
      const clipEvents =
        ((eventsByLegacyClipId.get(
          clipRow.id,
        ) ?? []) as LegacyClipEventRow[]);
      const totalPlays = clipEvents.filter(
        (eventRow: LegacyClipEventRow) =>
          eventRow.event_type ===
          "answer_submitted"
      ).length;
      const totalCorrect = clipEvents.filter(
        (eventRow: LegacyClipEventRow) =>
          eventRow.event_type ===
          "answer_correct"
      ).length;
      const totalWrong = clipEvents.filter(
        (eventRow: LegacyClipEventRow) =>
          eventRow.event_type ===
          "answer_wrong"
      ).length;
      const totalTimeouts = clipEvents.filter(
        (eventRow: LegacyClipEventRow) =>
          eventRow.event_type === "timeout"
      ).length;
      const totalLoadFailures = clipEvents.filter(
        (eventRow: LegacyClipEventRow) =>
          eventRow.event_type ===
          "clip_failed_to_load"
      ).length;
      const totalLoadSuccess = clipEvents.filter(
        (eventRow: LegacyClipEventRow) =>
          eventRow.event_type === "clip_loaded" ||
          eventRow.event_type === "clip_started"
      ).length;
      const totalHintsUsed = clipEvents.filter(
        (eventRow: LegacyClipEventRow) =>
          eventRow.payload?.usedHint === true ||
          eventRow.event_type ===
            "hint_requested"
      ).length;
      const answerTimes = clipEvents
        .map((eventRow: LegacyClipEventRow) =>
          Number(
            eventRow.payload?.answerTimeSeconds,
          )
        )
        .filter((value: number) =>
          Number.isFinite(value)
        );
      const avgAnswerTimeSeconds =
        answerTimes.length > 0
          ? answerTimes.reduce(
              (sum: number, value: number) =>
                sum + value,
              0
            ) / answerTimes.length
          : 0;
      const lastPlayedAt =
        clipEvents.reduce(
          (
            latest: string,
            eventRow: LegacyClipEventRow,
          ) =>
            latest > eventRow.occurred_at
              ? latest
              : eventRow.occurred_at,
          "",
        ) || null;

      return {
        contentMediaId: clipRow.id,
        contentId: clipRow.movie_id,
        legacyClipId: clipRow.id,
        movieTitle:
          movieRow?.title ?? "Untitled movie",
        releaseYear:
          movieRow?.release_year ?? null,
        sourceName: null,
        sourceUrl:
          clipRow.source_url ??
          clipRow.media_url ??
          null,
        licenseStatus:
          clipRow.licensing_status ?? "pending",
        publicationStatus: movieRow?.is_active
          ? "published"
          : "draft",
        movieIsActive: movieRow?.is_active ?? true,
        mediaType:
          clipRow.clip_type?.toLowerCase() ===
          "audio"
            ? "audio"
            : "video",
        section: "any",
        targetDifficulty:
          getMovieBuffDifficultyLabel(
            movieRow?.difficulty ?? "medium"
          ),
        clipStartSeconds: null,
        clipEndSeconds: null,
        clipDurationSeconds: null,
        clipTitle: null,
        clipIsActive: clipRow.is_active,
        clipIsHidden: false,
        totalPlays,
        totalCorrect,
        totalWrong,
        totalHintsUsed,
        totalTimeouts,
        totalLoadSuccess,
        totalLoadFailures,
        sampleSize: totalPlays,
        confidenceFactor: Math.min(
          1,
          Math.max(0, totalPlays / 8)
        ),
        avgAnswerTimeSeconds,
        correctRate:
          totalPlays > 0
            ? totalCorrect / totalPlays
            : 0,
        hintRate:
          totalPlays > 0
            ? totalHintsUsed / totalPlays
            : 0,
        difficultyScore: 50,
        systemDifficultyLabel:
          getMovieBuffDifficultyLabel(
            movieRow?.difficulty ?? "medium"
          ),
        qualityScore:
          totalLoadFailures > 0
            ? 35
            : clipRow.is_active
              ? 100
              : 0,
        rotationScore: clipRow.is_active ? 50 : 0,
        rotationWeight:
          clipRow.is_active &&
          totalLoadFailures === 0
            ? 50
            : 0,
        adminBoost: 0,
        status: clipRow.is_active
          ? "active"
          : "retired",
        qualityFlags:
          totalLoadFailures > 0
            ? ["broken_playback"]
            : [],
        lastPlayedAt,
        lastLoadedAt: null,
        updatedAt: lastPlayedAt,
      } satisfies MovieBuffClipAdminRow;
    })
    .sort((left, right) =>
      (right.releaseYear ?? 0) -
      (left.releaseYear ?? 0)
    );

  if (typeof limit === "number") {
    rows = rows.slice(0, limit);
  }

  return rows;
}

export async function listMovieBuffClipAdminRows(
  limit?: number
): Promise<MovieBuffClipAdminRow[]> {
  let mediaQuery = supabaseAdmin
    .from("content_media")
    .select(
      "id, content_id, legacy_clip_id, media_type, round_position, difficulty, start_seconds, end_seconds, duration_seconds, is_active, is_hidden, source_url, title"
    )
    .in("media_type", ["video", "audio"])
    .order("created_at", {
      ascending: false,
    });

  if (typeof limit === "number") {
    mediaQuery = mediaQuery.limit(limit);
  }

  const {
    data: mediaData,
    error: mediaError,
  } = await mediaQuery;

  if (mediaError) {
    if (
      isMissingAnalyticsContentSchema(
        mediaError.message,
      )
    ) {
      return listLegacyMovieBuffClipAdminRows(
        limit
      );
    }

    throw new Error(mediaError.message);
  }

  const mediaRows =
    (mediaData as ContentMediaRow[] | null) ?? [];
  const contentIds = Array.from(
    new Set(
      mediaRows.map((row) => row.content_id)
    )
  );
  const mediaIds = mediaRows.map((row) => row.id);

  const [
    { data: contentData, error: contentError },
    {
      data: analyticsData,
      error: analyticsError,
    },
  ] = await Promise.all([
    contentIds.length > 0
      ? supabaseAdmin
          .from("content_items")
          .select(
            "id, title, release_year, source_name, source_url, licensing_status, publication_status, is_active, metadata"
          )
          .in("id", contentIds)
      : Promise.resolve({
          data: [],
          error: null,
        }),
    mediaIds.length > 0
      ? supabaseAdmin
          .from("movie_buff_clip_analytics")
          .select("*")
          .in("content_media_id", mediaIds)
      : Promise.resolve({
          data: [],
          error: null,
        }),
  ]);

  if (contentError) {
    if (
      isMissingAnalyticsContentSchema(
        contentError.message,
      )
    ) {
      return mediaRows.map((mediaRow) => ({
        contentMediaId: mediaRow.id,
        contentId: mediaRow.content_id,
        legacyClipId: mediaRow.legacy_clip_id,
        movieTitle: "Untitled movie",
        releaseYear: null,
        sourceName: null,
        sourceUrl: mediaRow.source_url,
        licenseStatus: "pending",
        publicationStatus: "draft",
        movieIsActive: true,
        mediaType: mediaRow.media_type,
        section: mediaRow.round_position,
        targetDifficulty:
          getMovieBuffDifficultyLabel(
            mediaRow.difficulty,
          ),
        clipStartSeconds:
          toNumber(mediaRow.start_seconds, 0) ===
            0 && mediaRow.start_seconds == null
            ? null
            : toNumber(mediaRow.start_seconds),
        clipEndSeconds:
          toNumber(mediaRow.end_seconds, 0) ===
            0 && mediaRow.end_seconds == null
            ? null
            : toNumber(mediaRow.end_seconds),
        clipDurationSeconds:
          toNumber(mediaRow.duration_seconds, 0) ===
            0 &&
          mediaRow.duration_seconds == null
            ? null
            : toNumber(mediaRow.duration_seconds),
        clipTitle: mediaRow.title,
        clipIsActive: mediaRow.is_active,
        clipIsHidden: mediaRow.is_hidden,
        totalPlays: 0,
        totalCorrect: 0,
        totalWrong: 0,
        totalHintsUsed: 0,
        totalTimeouts: 0,
        totalLoadSuccess: 0,
        totalLoadFailures: 0,
        sampleSize: 0,
        confidenceFactor: 0,
        avgAnswerTimeSeconds: 0,
        correctRate: 0,
        hintRate: 0,
        difficultyScore: 50,
        systemDifficultyLabel: "Buff",
        qualityScore: 100,
        rotationScore: 50,
        rotationWeight: 50,
        adminBoost: 0,
        status: "active",
        qualityFlags: [],
        lastPlayedAt: null,
        lastLoadedAt: null,
        updatedAt: null,
      }));
    }

    throw new Error(contentError.message);
  }

  if (analyticsError) {
    if (
      isMissingAnalyticsContentSchema(
        analyticsError.message,
      )
    ) {
      const contentById = new Map(
        ((contentData as ContentItemRow[] | null) ??
          []
        ).map((row) => [row.id, row])
      );

      return mediaRows.map((mediaRow) => {
        const contentRow =
          contentById.get(mediaRow.content_id);

        return {
          contentMediaId: mediaRow.id,
          contentId: mediaRow.content_id,
          legacyClipId: mediaRow.legacy_clip_id,
          movieTitle:
            contentRow?.title ??
            "Untitled movie",
          releaseYear:
            contentRow?.release_year ?? null,
          sourceName:
            contentRow?.source_name ?? null,
          sourceUrl:
            contentRow?.source_url ??
            mediaRow.source_url,
          licenseStatus:
            contentRow?.licensing_status ??
            "pending",
          publicationStatus:
            contentRow?.publication_status ??
            "draft",
          movieIsActive:
            contentRow?.is_active ?? true,
          mediaType: mediaRow.media_type,
          section: mediaRow.round_position,
          targetDifficulty:
            getMovieBuffDifficultyLabel(
              mediaRow.difficulty,
            ),
          clipStartSeconds:
            toNumber(mediaRow.start_seconds, 0) ===
              0 && mediaRow.start_seconds == null
              ? null
              : toNumber(mediaRow.start_seconds),
          clipEndSeconds:
            toNumber(mediaRow.end_seconds, 0) ===
              0 && mediaRow.end_seconds == null
              ? null
              : toNumber(mediaRow.end_seconds),
          clipDurationSeconds:
            toNumber(
              mediaRow.duration_seconds,
              0,
            ) === 0 &&
            mediaRow.duration_seconds == null
              ? null
              : toNumber(
                  mediaRow.duration_seconds,
                ),
          clipTitle: mediaRow.title,
          clipIsActive: mediaRow.is_active,
          clipIsHidden: mediaRow.is_hidden,
          totalPlays: 0,
          totalCorrect: 0,
          totalWrong: 0,
          totalHintsUsed: 0,
          totalTimeouts: 0,
          totalLoadSuccess: 0,
          totalLoadFailures: 0,
          sampleSize: 0,
          confidenceFactor: 0,
          avgAnswerTimeSeconds: 0,
          correctRate: 0,
          hintRate: 0,
          difficultyScore: 50,
          systemDifficultyLabel: "Buff",
          qualityScore: 100,
          rotationScore: 50,
          rotationWeight: 50,
          adminBoost: 0,
          status: "active",
          qualityFlags: [],
          lastPlayedAt: null,
          lastLoadedAt: null,
          updatedAt: null,
        };
      });
    }

    throw new Error(analyticsError.message);
  }

  const contentById = new Map(
    ((contentData as ContentItemRow[] | null) ??
      []
    ).map((row) => [row.id, row])
  );
  const analyticsByMediaId = new Map(
    ((analyticsData as ClipAnalyticsRow[] | null) ??
      []
    ).map((row) => [row.content_media_id, row])
  );

  return mediaRows.map((mediaRow) => {
    const contentRow =
      contentById.get(mediaRow.content_id);
    const analyticsRow =
      analyticsByMediaId.get(mediaRow.id);
    const totalPlays = toNumber(
      analyticsRow?.total_plays
    );
    const sampleSize = toNumber(
      analyticsRow?.sample_size,
      totalPlays
    );
    const totalHintsUsed = toNumber(
      analyticsRow?.total_hints_used
    );

    return {
      contentMediaId: mediaRow.id,
      contentId: mediaRow.content_id,
      legacyClipId: mediaRow.legacy_clip_id,
      movieTitle:
        contentRow?.title ?? "Untitled movie",
      releaseYear:
        contentRow?.release_year ?? null,
      sourceName:
        contentRow?.source_name ?? null,
      sourceUrl:
        contentRow?.source_url ?? mediaRow.source_url,
      licenseStatus:
        contentRow?.licensing_status ??
        "pending",
      publicationStatus:
        contentRow?.publication_status ??
        "draft",
      movieIsActive:
        contentRow?.is_active ?? true,
      mediaType: mediaRow.media_type,
      section: mediaRow.round_position,
      targetDifficulty:
        getMovieBuffDifficultyLabel(
          mediaRow.difficulty,
        ),
      clipStartSeconds:
        toNumber(mediaRow.start_seconds, 0) === 0 &&
        mediaRow.start_seconds == null
          ? null
          : toNumber(mediaRow.start_seconds),
      clipEndSeconds:
        toNumber(mediaRow.end_seconds, 0) === 0 &&
        mediaRow.end_seconds == null
          ? null
          : toNumber(mediaRow.end_seconds),
      clipDurationSeconds:
        toNumber(mediaRow.duration_seconds, 0) === 0 &&
        mediaRow.duration_seconds == null
          ? null
          : toNumber(mediaRow.duration_seconds),
      clipTitle: mediaRow.title,
      clipIsActive: mediaRow.is_active,
      clipIsHidden: mediaRow.is_hidden,
      totalPlays,
      totalCorrect: toNumber(
        analyticsRow?.total_correct
      ),
      totalWrong: toNumber(
        analyticsRow?.total_wrong
      ),
      totalHintsUsed,
      totalTimeouts: toNumber(
        analyticsRow?.total_timeouts
      ),
      totalLoadSuccess: toNumber(
        analyticsRow?.total_load_success
      ),
      totalLoadFailures: toNumber(
        analyticsRow?.total_load_failures
      ),
      sampleSize,
      confidenceFactor: Math.min(
        1,
        Math.max(0, sampleSize / 8)
      ),
      avgAnswerTimeSeconds: toNumber(
        analyticsRow?.avg_answer_time_seconds
      ),
      correctRate:
        totalPlays > 0
          ? toNumber(
              analyticsRow?.total_correct
            ) / totalPlays
          : 0,
      hintRate:
        totalPlays > 0
          ? totalHintsUsed / totalPlays
          : 0,
      difficultyScore: toNumber(
        analyticsRow?.difficulty_score,
        50
      ),
      systemDifficultyLabel:
        analyticsRow?.system_difficulty_label ??
        "Buff",
      qualityScore: toNumber(
        analyticsRow?.quality_score,
        100
      ),
      rotationScore: toNumber(
        analyticsRow?.rotation_score,
        50
      ),
      rotationWeight: toNumber(
        analyticsRow?.rotation_weight,
        50
      ),
      adminBoost: toNumber(
        analyticsRow?.admin_boost
      ),
      status:
        analyticsRow?.status ?? "active",
      qualityFlags: normalizeStringArray(
        analyticsRow?.quality_flags
      ),
      lastPlayedAt:
        analyticsRow?.last_played_at ?? null,
      lastLoadedAt:
        analyticsRow?.last_loaded_at ?? null,
      updatedAt:
        analyticsRow?.updated_at ?? null,
    };
  });
}

export async function getMovieBuffAnalyticsSummary(): Promise<MovieBuffAnalyticsSummary> {
  const clipRows =
    await listMovieBuffClipAdminRows();
  const totalMovies = new Set(
    clipRows.map((row) => row.contentId)
  ).size;
  const playableClips = clipRows.filter(
    (row) =>
      row.clipIsActive &&
      !row.clipIsHidden &&
      row.qualityScore >= 45
  ).length;
  const activeRotationClips = clipRows.filter(
    (row) =>
      row.rotationWeight > 0 &&
      !["retired", "test_only", "cooling_down"].includes(
        row.status
      )
  ).length;

  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();
  const twentyFourHoursAgo = new Date(
    Date.now() - 24 * 60 * 60 * 1000
  ).toISOString();

  const [
    {
      count: recentFailures7d,
      error: failuresError,
    },
    { count: events24h, error: eventsError },
  ] = await Promise.all([
    supabaseAdmin
      .from("movie_buff_round_events")
      .select("*", {
        count: "exact",
        head: true,
      })
      .eq("event_type", "clip_failed_to_load")
      .gte("occurred_at", sevenDaysAgo),
    supabaseAdmin
      .from("movie_buff_round_events")
      .select("*", {
        count: "exact",
        head: true,
      })
      .gte("occurred_at", twentyFourHoursAgo),
  ]);

  if (failuresError) {
    throw new Error(failuresError.message);
  }

  if (eventsError) {
    throw new Error(eventsError.message);
  }

  return {
    totalMovies,
    totalTrackedClips: clipRows.length,
    playableClips,
    activeRotationClips,
    recentFailures7d: recentFailures7d ?? 0,
    events24h: events24h ?? 0,
  };
}

export async function getMovieBuffMatchAnalytics(
  limit = 200
): Promise<MovieBuffMatchAnalytics> {
  const {
    data,
    error,
  } = await supabaseAdmin
    .from("movie_buff_round_events")
    .select(
      "id, event_type, room_id, match_id, round_id, occurred_at, payload"
    )
    .order("occurred_at", {
      ascending: false,
    })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  const recentEvents =
    (data as EventRow[] | null) ?? [];
  const countMap = new Map<string, number>();
  const roomMap = new Map<
    string,
    MovieBuffMatchAnalytics["roomSummaries"][number]
  >();

  recentEvents.forEach((eventRow) => {
    countMap.set(
      eventRow.event_type,
      (countMap.get(eventRow.event_type) ?? 0) +
        1
    );

    if (!eventRow.room_id) {
      return;
    }

    const current =
      roomMap.get(eventRow.room_id) ?? {
        roomId: eventRow.room_id,
        totalEvents: 0,
        roundsStarted: 0,
        clipsStarted: 0,
        answersSubmitted: 0,
        failures: 0,
        latestAt: eventRow.occurred_at,
      };

    current.totalEvents += 1;
    current.latestAt =
      current.latestAt > eventRow.occurred_at
        ? current.latestAt
        : eventRow.occurred_at;

    if (eventRow.event_type === "round_started") {
      current.roundsStarted += 1;
    }

    if (eventRow.event_type === "clip_started") {
      current.clipsStarted += 1;
    }

    if (
      eventRow.event_type === "answer_submitted"
    ) {
      current.answersSubmitted += 1;
    }

    if (
      eventRow.event_type ===
      "clip_failed_to_load"
    ) {
      current.failures += 1;
    }

    roomMap.set(eventRow.room_id, current);
  });

  return {
    recentEvents,
    eventCounts: Array.from(
      countMap.entries()
    )
      .map(([eventType, count]) => ({
        eventType,
        count,
      }))
      .sort((first, second) => {
        if (second.count !== first.count) {
          return second.count - first.count;
        }

        return first.eventType.localeCompare(
          second.eventType
        );
      }),
    roomSummaries: Array.from(roomMap.values())
      .sort((first, second) =>
        second.latestAt.localeCompare(
          first.latestAt
        )
      )
      .slice(0, 20),
  };
}

export async function updateMovieBuffClipControls(input: {
  contentMediaId: string;
  adminBoost: number;
  status: string;
  qualityFlags: string[];
}) {
  const {
    data: mediaData,
    error: mediaError,
  } = await supabaseAdmin
    .from("content_media")
    .select("id, content_id, legacy_clip_id")
    .eq("id", input.contentMediaId)
    .maybeSingle();

  if (mediaError) {
    throw new Error(mediaError.message);
  }

  const mediaRow = mediaData as
    | {
        id: string;
        content_id: string;
        legacy_clip_id: string | null;
      }
    | null;

  if (!mediaRow) {
    throw new Error(
      "The selected clip could not be found."
    );
  }

  const {
    error: upsertError,
  } = await supabaseAdmin
    .from("movie_buff_clip_analytics")
    .upsert(
      {
        content_media_id: mediaRow.id,
        content_id: mediaRow.content_id,
        legacy_clip_id:
          mediaRow.legacy_clip_id,
        admin_boost: Math.max(
          -3,
          Math.min(3, input.adminBoost)
        ),
        status: input.status,
        quality_flags: input.qualityFlags,
      },
      {
        onConflict: "content_media_id",
      }
    );

  if (upsertError) {
    throw new Error(upsertError.message);
  }

  const { error: refreshError } =
    await supabaseAdmin.rpc(
      "movie_buff_refresh_clip_analytics",
      {
        p_content_media_id: input.contentMediaId,
      }
    );

  if (refreshError) {
    throw new Error(refreshError.message);
  }
}
