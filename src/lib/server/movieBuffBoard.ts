import "server-only";

import {
  movieBuffBoardBandPresentation,
  movieBuffBoardTileBands,
  type MovieBuffBoardDraft,
  type MovieBuffBoardDraftCategory,
  type MovieBuffBoardPreview,
  type MovieBuffBoardTileBand,
  type MovieBuffBoardTilePreview,
} from "@/lib/game/movieBuffBoard";
import { listMovieBuffLobbyCategories } from "@/lib/server/movieBuffLobby";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

type BoardEligibleMediaRow = {
  id: string;
  content_id: string;
  board_band: string | null;
  legacy_clip_id: string | null;
  media_url: string | null;
  quality_score: number | null;
  is_active: boolean;
  content_items: {
    id: string;
    title: string;
    era_bucket: string | null;
    primary_genre: string | null;
    publication_status: string;
    is_active: boolean;
  } | null;
  content_categories: Array<{
    is_primary: boolean;
    categories: {
      id: string;
      name: string;
      slug: string;
    } | null;
  }> | null;
};

type EligibleBoardMedia = {
  clipId: string | null;
  contentMediaId: string | null;
  contentId: string | null;
  contentTitle: string;
  boardBand: MovieBuffBoardTileBand;
  mediaUrl: string;
  qualityScore: number;
};

type LegacyBoardClipRow = {
  id: string;
  movie_id: string;
  difficulty: string | null;
  media_url: string | null;
  clip_type: string | null;
  is_active: boolean;
  movies: {
    id: string;
    title: string | null;
    is_active: boolean;
  } | null;
};

type EligibleBoardCategory = {
  id: string;
  label: string;
  slug: string;
  eraBucket: string | null;
  primaryGenre: string | null;
  playableTileCountByBand: Record<string, number>;
  mediaByBand: Record<MovieBuffBoardTileBand, EligibleBoardMedia[]>;
};

type RoomPlayerRow = {
  player_id: string;
  is_host: boolean;
  joined_at: string;
  score: number;
  profiles: {
    display_name: string | null;
    username: string | null;
  } | null;
};

type PersistedBoardTileRow = {
  id: string;
  board_category_id: string;
  tile_order: number;
  band: MovieBuffBoardTileBand;
  point_value: number;
  is_used: boolean;
  clip_id: string | null;
  content_media_id: string | null;
};

type PersistedBoardCategoryRow = {
  id: string;
  display_order: number;
  label: string;
  era_bucket: string | null;
  primary_genre: string | null;
  movie_buff_board_tiles: PersistedBoardTileRow[];
};

type PersistedBoardRow = {
  id: string;
  room_id: string;
  status: string;
  selector_player_id: string | null;
  current_tile_id: string | null;
  tiles_used_count: number;
  total_tiles_count: number;
  movie_buff_board_categories: PersistedBoardCategoryRow[] | null;
};

function toPreviewId(prefix: string, index: number) {
  return `${prefix}-${index + 1}`;
}

function emptyMediaByBand(): Record<
  MovieBuffBoardTileBand,
  EligibleBoardMedia[]
> {
  return {
    fan_200: [],
    fan_400: [],
    fanatic_600: [],
    fanatic_800: [],
    buff_1000: [],
    buff_1200: [],
  };
}

function getTierLabel(band: MovieBuffBoardTileBand) {
  return (
    movieBuffBoardBandPresentation[band].label.split(" - ")[0] ?? ""
  );
}

function isPermissionDeniedError(
  message: string | null | undefined,
) {
  const normalizedMessage =
    message?.toLowerCase() ?? "";

  return (
    normalizedMessage.includes("permission denied") ||
    normalizedMessage.includes("42501")
  );
}

function isUnavailableBoardTableError(
  message: string | null | undefined,
) {
  const normalizedMessage =
    message?.toLowerCase() ?? "";

  return (
    normalizedMessage.includes("movie_buff_board") &&
    (normalizedMessage.includes("schema cache") ||
      normalizedMessage.includes("does not exist") ||
      isPermissionDeniedError(normalizedMessage))
  );
}

function isUnavailableContentEngineError(
  message: string | null | undefined,
) {
  const normalizedMessage =
    message?.toLowerCase() ?? "";

  return (
    isPermissionDeniedError(normalizedMessage) ||
    normalizedMessage.includes("content_media") ||
    normalizedMessage.includes("content_items")
  );
}

function createEligibleCategory(
  category: {
    id: string;
    name: string;
    slug: string;
  },
  row: BoardEligibleMediaRow,
): EligibleBoardCategory {
  return {
    id: category.id,
    label: category.name,
    slug: category.slug,
    eraBucket: row.content_items?.era_bucket ?? null,
    primaryGenre: row.content_items?.primary_genre ?? null,
    playableTileCountByBand: Object.fromEntries(
      movieBuffBoardTileBands.map((band) => [band, 0]),
    ),
    mediaByBand: emptyMediaByBand(),
  };
}

async function listEligibleBoardCategories(): Promise<
  EligibleBoardCategory[]
> {
  const { data, error } = await supabaseAdmin
    .from("content_media")
    .select(
      `
        id,
        content_id,
        board_band,
        legacy_clip_id,
        media_url,
        quality_score,
        is_active,
        content_items:content_id (
          id,
          title,
          era_bucket,
          primary_genre,
          publication_status,
          is_active
        ),
        content_categories:content_id (
          is_primary,
          categories:category_id (
            id,
            name,
            slug
          )
        )
      `,
    )
    .eq("is_active", true)
    .not("board_band", "is", null);

  if (error) {
    if (isUnavailableContentEngineError(error.message)) {
      return [];
    }

    throw new Error(error.message);
  }

  const rows = (data ?? []) as unknown as BoardEligibleMediaRow[];
  const categoryMap = new Map<string, EligibleBoardCategory>();

  for (const row of rows) {
    const content = row.content_items;
    const boardBand = row.board_band?.trim() ?? "";

    if (!content) {
      continue;
    }

    if (!movieBuffBoardTileBands.includes(boardBand as MovieBuffBoardTileBand)) {
      continue;
    }

    if (!content.is_active || content.publication_status !== "published") {
      continue;
    }

    if (!row.is_active || (row.media_url ?? "").trim().length === 0) {
      continue;
    }

    if ((row.quality_score ?? 100) < 45) {
      continue;
    }

    const primaryCategoryLink =
      row.content_categories?.find(
        (link) => link.is_primary && link.categories,
      ) ??
      row.content_categories?.find((link) => link.categories) ??
      null;

    const category = primaryCategoryLink?.categories;

    if (!category) {
      continue;
    }

    const band = boardBand as MovieBuffBoardTileBand;
    const existing =
      categoryMap.get(category.id) ??
      (() => {
        const next = createEligibleCategory(category, row);
        categoryMap.set(category.id, next);
        return next;
      })();

    existing.playableTileCountByBand[band] =
      (existing.playableTileCountByBand[band] ?? 0) + 1;

    existing.mediaByBand[band].push({
      clipId: row.legacy_clip_id ?? null,
      contentMediaId: row.id,
      contentId: content.id,
      contentTitle: content.title,
      boardBand: band,
      mediaUrl: row.media_url ?? "",
      qualityScore: row.quality_score ?? 100,
    });

    if (!existing.eraBucket && content.era_bucket) {
      existing.eraBucket = content.era_bucket;
    }

    if (!existing.primaryGenre && content.primary_genre) {
      existing.primaryGenre = content.primary_genre;
    }
  }

  return Array.from(categoryMap.values())
    .sort((a, b) => a.label.localeCompare(b.label));
}

function buildFallbackDraftFromLobby(
  categories: Array<{
    id: string;
    name: string;
    slug: string;
    eraBucket: string | null;
    primaryGenre: string | null;
  }>,
): MovieBuffBoardDraft {
  const draftCategories: MovieBuffBoardDraftCategory[] = categories.map(
    (category, categoryIndex) => ({
      id: toPreviewId("category", categoryIndex),
      categoryId: category.id,
      label: category.name,
      slug: category.slug,
      eraBucket: category.eraBucket,
      primaryGenre: category.primaryGenre,
      tiles: movieBuffBoardTileBands.map((band, tileIndex) => ({
        id: toPreviewId(`tile-${categoryIndex + 1}`, tileIndex),
        band,
        tierLabel: getTierLabel(band),
        label: movieBuffBoardBandPresentation[band].label,
        pointValue: movieBuffBoardBandPresentation[band].points,
        status: "available",
      })),
    }),
  );

  return {
    headline: "So You Think You're a Movie Buff?",
    supportLine: "Watch. Guess. Win.",
    categoryCount: draftCategories.length,
    tileCount: draftCategories.length * movieBuffBoardTileBands.length,
    categories: draftCategories,
  };
}

function mapLegacyDifficultyToBoardBands(
  difficulty: string | null | undefined,
): MovieBuffBoardTileBand[] {
  const normalized = String(difficulty ?? "")
    .trim()
    .toLowerCase();

  if (normalized === "easy" || normalized === "fan") {
    return ["fan_200", "fan_400"];
  }

  if (
    normalized === "hard" ||
    normalized === "expert" ||
    normalized === "buffster"
  ) {
    return ["buff_1000", "buff_1200"];
  }

  return ["fanatic_600", "fanatic_800"];
}

async function listLegacyEligibleBoardCategories(): Promise<
  EligibleBoardCategory[]
> {
  const { data, error } = await supabaseAdmin
    .from("clips")
    .select(
      `
        id,
        movie_id,
        difficulty,
        media_url,
        clip_type,
        is_active,
        movies:movie_id (
          id,
          title,
          is_active
        )
      `,
    )
    .eq("is_active", true)
    .eq("clip_type", "video");

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as unknown as LegacyBoardClipRow[];
  const movieIds = Array.from(
    new Set(rows.map((row) => row.movie_id).filter(Boolean)),
  );
  const { data: categoryLinks, error: categoryLinksError } =
    movieIds.length === 0
      ? { data: [], error: null }
      : await supabaseAdmin
          .from("movie_categories")
          .select(
            `
              movie_id,
              categories:category_id (
                id,
                name,
                slug
              )
            `,
          )
          .in("movie_id", movieIds);

  if (categoryLinksError) {
    throw new Error(categoryLinksError.message);
  }

  const categoryByMovieId = new Map<
    string,
    {
      id: string;
      name: string;
      slug: string;
    }
  >();

  for (const link of (categoryLinks ?? []) as Array<{
    movie_id?: string | null;
    categories?: {
      id?: string | null;
      name?: string | null;
      slug?: string | null;
    } | null;
  }>) {
    const movieId = link.movie_id ?? null;
    const category = link.categories ?? null;

    if (
      !movieId ||
      !category?.id ||
      !category.name ||
      !category.slug ||
      categoryByMovieId.has(movieId)
    ) {
      continue;
    }

    categoryByMovieId.set(movieId, {
      id: category.id,
      name: category.name,
      slug: category.slug,
    });
  }

  const categoryMap = new Map<string, EligibleBoardCategory>();

  for (const row of rows) {
    const movie = row.movies;
    const mediaUrl = row.media_url?.trim() ?? "";

    if (!movie?.id || !movie.is_active || mediaUrl.length === 0) {
      continue;
    }

    const category = categoryByMovieId.get(movie.id);

    if (!category) {
      continue;
    }

    const bands = mapLegacyDifficultyToBoardBands(row.difficulty);
    const existing =
      categoryMap.get(category.id) ??
      (() => {
        const next = createEligibleCategory(category, {
          content_items: null,
        } as BoardEligibleMediaRow);
        categoryMap.set(category.id, next);
        return next;
      })();

    for (const band of bands) {
      existing.playableTileCountByBand[band] =
        (existing.playableTileCountByBand[band] ?? 0) + 1;

      existing.mediaByBand[band].push({
        clipId: row.id,
        contentMediaId: null,
        contentId: movie.id,
        contentTitle: movie.title?.trim() || "Movie Buff clip",
        boardBand: band,
        mediaUrl,
        qualityScore: 100,
      });
    }
  }

  return Array.from(categoryMap.values())
    .sort((a, b) => a.label.localeCompare(b.label));
}

async function listLegacyFallbackMediaByBand(): Promise<
  Record<MovieBuffBoardTileBand, EligibleBoardMedia[]>
> {
  const { data, error } = await supabaseAdmin
    .from("clips")
    .select(
      `
        id,
        movie_id,
        difficulty,
        media_url,
        clip_type,
        is_active,
        movies:movie_id (
          id,
          title,
          is_active
        )
      `,
    )
    .eq("is_active", true)
    .eq("clip_type", "video");

  if (error) {
    throw new Error(error.message);
  }

  const mediaByBand = emptyMediaByBand();

  for (const row of (data ?? []) as unknown as LegacyBoardClipRow[]) {
    const movie = row.movies;
    const mediaUrl = row.media_url?.trim() ?? "";

    if (!movie?.id || !movie.is_active || mediaUrl.length === 0) {
      continue;
    }

    for (const band of mapLegacyDifficultyToBoardBands(row.difficulty)) {
      mediaByBand[band].push({
        clipId: row.id,
        contentMediaId: null,
        contentId: movie.id,
        contentTitle: movie.title?.trim() || "Movie Buff clip",
        boardBand: band,
        mediaUrl,
        qualityScore: 100,
      });
    }
  }

  return mediaByBand;
}

function buildLegacyLobbyFallbackDraft(
  categories: Array<{
    id: string;
    name: string;
    slug: string;
    eraBucket: string | null;
    primaryGenre: string | null;
  }>,
  mediaByBand: Record<MovieBuffBoardTileBand, EligibleBoardMedia[]>,
): MovieBuffBoardDraft {
  const usedMediaKeys = new Set<string>();

  const pickMediaForBand = (
    band: MovieBuffBoardTileBand,
  ) => {
    const candidates = mediaByBand[band] ?? [];
    const unseenCandidate =
      candidates.find((candidate) => {
        const key =
          candidate.contentMediaId ??
          candidate.clipId ??
          candidate.contentId ??
          candidate.mediaUrl;

        return !usedMediaKeys.has(key);
      }) ?? null;
    const selectedMedia =
      unseenCandidate ?? candidates[0] ?? null;

    if (selectedMedia) {
      const key =
        selectedMedia.contentMediaId ??
        selectedMedia.clipId ??
        selectedMedia.contentId ??
        selectedMedia.mediaUrl;

      usedMediaKeys.add(key);
    }

    return selectedMedia;
  };

  const draftCategories: MovieBuffBoardDraftCategory[] = categories.map(
    (category, categoryIndex) => ({
      id: toPreviewId("category", categoryIndex),
      categoryId: category.id,
      label: category.name,
      slug: category.slug,
      eraBucket: category.eraBucket,
      primaryGenre: category.primaryGenre,
      tiles: movieBuffBoardTileBands.map((band, tileIndex) => {
        const selectedMedia =
          pickMediaForBand(band);

        return {
          id: toPreviewId(`tile-${categoryIndex + 1}`, tileIndex),
          band,
          tierLabel: getTierLabel(band),
          label: movieBuffBoardBandPresentation[band].label,
          pointValue: movieBuffBoardBandPresentation[band].points,
          status: "available",
          clipId: selectedMedia?.clipId ?? undefined,
          contentMediaId:
            selectedMedia?.contentMediaId ?? undefined,
          contentTitle: selectedMedia?.contentTitle ?? null,
        };
      }),
    }),
  );

  return {
    headline: "So You Think You're a Movie Buff?",
    supportLine: "Watch. Guess. Win.",
    categoryCount: draftCategories.length,
    tileCount: draftCategories.length * movieBuffBoardTileBands.length,
    categories: draftCategories,
  };
}

async function listRoomPlayers(
  roomId: string,
): Promise<RoomPlayerRow[]> {
  const { data, error } = await supabaseAdmin
    .from("room_players")
    .select(
      `
        player_id,
        is_host,
        joined_at,
        score,
        profiles:player_id (
          display_name,
          username
        )
      `,
    )
    .eq("room_id", roomId)
    .is("left_at", null)
    .order("joined_at", { ascending: true });

  if (error) {
    if (isPermissionDeniedError(error.message)) {
      return [];
    }

    throw new Error(error.message);
  }

  return (data ?? []) as unknown as RoomPlayerRow[];
}

function toPreviewTile(
  tile: PersistedBoardTileRow,
  currentTileId: string | null,
): MovieBuffBoardTilePreview {
  return {
    id: tile.id,
    band: tile.band,
    tierLabel: getTierLabel(tile.band),
    label: movieBuffBoardBandPresentation[tile.band].label,
    pointValue: tile.point_value,
    status: tile.is_used
      ? "used"
      : currentTileId === tile.id
        ? "locked"
        : "available",
    clipId: tile.clip_id ?? undefined,
    contentMediaId: tile.content_media_id ?? undefined,
  };
}

function toBoardPreviewFromPersisted(
  board: PersistedBoardRow,
  roomPlayers: RoomPlayerRow[],
): MovieBuffBoardPreview {
  const selector =
    roomPlayers.find(
      (player) => player.player_id === board.selector_player_id,
    ) ??
    roomPlayers[0] ??
    null;

  return {
    headline: "So You Think You're a Movie Buff?",
    supportLine: "Watch. Guess. Win.",
    currentTurnLabel: selector
      ? `${selector.profiles?.display_name?.trim() || selector.profiles?.username?.trim() || "Player"} picks the next tile`
      : "Choose the next tile",
    boardStatusLabel: `Board 1 of 1 · ${board.tiles_used_count} of ${board.total_tiles_count} tiles used`,
    players: roomPlayers.map((player, index) => ({
      id: player.player_id,
      name:
        player.profiles?.display_name?.trim() ||
        player.profiles?.username?.trim() ||
        `Player ${index + 1}`,
      score: 0,
      tier: "Fan",
      isCurrentSelector:
        player.player_id === board.selector_player_id,
    })),
    categories: (board.movie_buff_board_categories ?? [])
      .slice()
      .sort((a, b) => a.display_order - b.display_order)
      .map((category) => ({
        id: category.id,
        label: category.label,
        eraBucket: category.era_bucket,
        primaryGenre: category.primary_genre,
        tiles: (category.movie_buff_board_tiles ?? [])
          .slice()
          .sort((a, b) => a.tile_order - b.tile_order)
          .map((tile) => toPreviewTile(tile, board.current_tile_id)),
      })),
  };
}

async function getPersistedBoard(
  roomId: string,
): Promise<PersistedBoardRow | null> {
  const { data: boardData, error: boardError } = await supabaseAdmin
    .from("movie_buff_boards")
    .select(
      `
        id,
        room_id,
        status,
        selector_player_id,
        current_tile_id,
        tiles_used_count,
        total_tiles_count
      `,
    )
    .eq("room_id", roomId)
    .maybeSingle();

  if (boardError) {
    if (isUnavailableBoardTableError(boardError.message)) {
      return null;
    }

    throw new Error(boardError.message);
  }

  const board = (boardData ?? null) as PersistedBoardRow | null;

  if (!board) {
    return null;
  }

  const [
    { data: categoriesData, error: categoriesError },
    { data: tilesData, error: tilesError },
  ] = await Promise.all([
    supabaseAdmin
      .from("movie_buff_board_categories")
      .select(
        `
          id,
          display_order,
          label,
          era_bucket,
          primary_genre
        `,
      )
      .eq("board_id", board.id)
      .order("display_order", { ascending: true }),
    supabaseAdmin
      .from("movie_buff_board_tiles")
      .select(
        `
          id,
          board_category_id,
          tile_order,
          band,
          point_value,
          is_used,
          clip_id,
          content_media_id
        `,
      )
      .eq("board_id", board.id)
      .order("tile_order", { ascending: true }),
  ]);

  if (categoriesError) {
    throw new Error(categoriesError.message);
  }

  if (tilesError) {
    throw new Error(tilesError.message);
  }

  const tilesByCategoryId = new Map<string, PersistedBoardTileRow[]>();

  for (const tile of (tilesData ?? []) as unknown as PersistedBoardTileRow[]) {
    const existingTiles =
      tilesByCategoryId.get(tile.board_category_id) ?? [];
    existingTiles.push(tile);
    tilesByCategoryId.set(tile.board_category_id, existingTiles);
  }

  return {
    ...board,
    movie_buff_board_categories: ((categoriesData ?? []) as unknown as PersistedBoardCategoryRow[]).map(
      (category) => ({
        ...category,
        movie_buff_board_tiles:
          tilesByCategoryId.get(category.id) ?? [],
      }),
    ),
  };
}

async function loadPersistedBoardPreview(
  roomId: string,
  roomPlayers: RoomPlayerRow[],
): Promise<{
  boardId: string;
  preview: MovieBuffBoardPreview;
} | null> {
  const board = await getPersistedBoard(roomId);

  if (!board) {
    return null;
  }

  const preview = toBoardPreviewFromPersisted(
    board,
    roomPlayers,
  );
  const hasAnyTiles = preview.categories.some(
    (category) => category.tiles.length > 0,
  );

  if (!hasAnyTiles) {
    return null;
  }

  return {
    boardId: board.id,
    preview,
  };
}

async function waitForPersistedBoardPreview(
  roomId: string,
  roomPlayers: RoomPlayerRow[],
): Promise<{
  boardId: string;
  preview: MovieBuffBoardPreview;
} | null> {
  const maxAttempts = 8;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const persistedBoardPreview =
      await loadPersistedBoardPreview(
        roomId,
        roomPlayers,
      );

    if (persistedBoardPreview) {
      return persistedBoardPreview;
    }

    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) =>
        setTimeout(resolve, 250),
      );
    }
  }

  return null;
}

export async function createMovieBuffBoardDraft(): Promise<MovieBuffBoardDraft> {
  const [eligibleCategories, lobbyCategories] = await Promise.all([
    listEligibleBoardCategories().catch(() => []),
    listMovieBuffLobbyCategories().catch(() => []),
  ]);

  const boardCategories =
    eligibleCategories.length > 0
      ? eligibleCategories
      : await listLegacyEligibleBoardCategories().catch(() => []);

  const legacyGlobalMediaByBand =
    await listLegacyFallbackMediaByBand().catch(() => emptyMediaByBand());
  const hasLegacyGlobalCoverage =
    movieBuffBoardTileBands.every(
      (band) => (legacyGlobalMediaByBand[band] ?? []).length > 0,
    );

  const lobbyFallbackCategories =
    lobbyCategories
      .filter((category) => category.id !== null)
      .slice(0, 6)
      .map((category) => ({
        id: category.id ?? "",
        name: category.name,
        slug: category.slug,
        eraBucket: null,
        primaryGenre: null,
      }));
  const legacyFallbackCategories =
    lobbyFallbackCategories.length > 0
      ? lobbyFallbackCategories
      : Array.from({ length: 6 }, (_, index) => ({
          id: `legacy-movie-mix-${index + 1}`,
          name: `Movie Mix ${index + 1}`,
          slug: `movie-mix-${index + 1}`,
          eraBucket: null,
          primaryGenre: null,
        }));
  const boardTileCapacity =
    boardCategories.length *
    movieBuffBoardTileBands.length;
  const needsLegacyFallbackBoard =
    boardCategories.length === 0 ||
    boardTileCapacity < 10;

  if (
    needsLegacyFallbackBoard &&
    hasLegacyGlobalCoverage
  ) {
    return buildLegacyLobbyFallbackDraft(
      legacyFallbackCategories,
      legacyGlobalMediaByBand,
    );
  }

  if (boardCategories.length === 0) {
    return buildFallbackDraftFromLobby(
      lobbyFallbackCategories,
    );
  }

  const draftCategories: MovieBuffBoardDraftCategory[] =
    boardCategories.slice(0, 6).map((category, categoryIndex) => ({
      id: toPreviewId("category", categoryIndex),
      categoryId: category.id,
      label: category.label,
      slug: category.slug,
      eraBucket: category.eraBucket,
      primaryGenre: category.primaryGenre,
      tiles: movieBuffBoardTileBands.map((band, tileIndex) => {
        const fallbackMedia = boardCategories
          .flatMap((candidateCategory) => candidateCategory.mediaByBand[band])
          .find(Boolean) ?? null;
        const legacyFallbackMedia =
          legacyGlobalMediaByBand[band].find(Boolean) ?? null;
        const selectedMedia =
          category.mediaByBand[band][0] ??
          fallbackMedia ??
          legacyFallbackMedia ??
          null;

        return {
          id: toPreviewId(`tile-${categoryIndex + 1}`, tileIndex),
          band,
          tierLabel: getTierLabel(band),
          label: movieBuffBoardBandPresentation[band].label,
          pointValue: movieBuffBoardBandPresentation[band].points,
          status: "available",
          clipId: selectedMedia?.clipId ?? undefined,
          contentMediaId:
            selectedMedia?.contentMediaId ?? undefined,
          contentTitle: selectedMedia?.contentTitle ?? null,
        };
      }),
    }));

  return {
    headline: "So You Think You're a Movie Buff?",
    supportLine: "Watch. Guess. Win.",
    categoryCount: draftCategories.length,
    tileCount: draftCategories.length * movieBuffBoardTileBands.length,
    categories: draftCategories,
  };
}

export async function ensureMovieBuffBoardForRoom(
  roomId: string,
): Promise<{
  boardId: string;
  preview: MovieBuffBoardPreview;
}> {
  const roomPlayers = await listRoomPlayers(roomId);
  const existingBoardPreview =
    await loadPersistedBoardPreview(
      roomId,
      roomPlayers,
    );

  if (existingBoardPreview) {
    return existingBoardPreview;
  }

  const draft = await createMovieBuffBoardDraft();
  const selectorPlayerId = roomPlayers[0]?.player_id ?? null;
  try {
    const { data: insertedBoard, error: boardError } = await supabaseAdmin
      .from("movie_buff_boards")
      .upsert(
        {
          room_id: roomId,
          status: "ready",
          selector_player_id: selectorPlayerId,
          tiles_used_count: 0,
          total_tiles_count: draft.tileCount,
        },
        {
          onConflict: "room_id",
          ignoreDuplicates: true,
        },
      )
      .select("id")
      .maybeSingle();

    if (boardError) {
      throw new Error(boardError.message);
    }

    if (!insertedBoard) {
      const recoveredBoardPreview =
        await waitForPersistedBoardPreview(
          roomId,
          roomPlayers,
        );

      if (recoveredBoardPreview) {
        return recoveredBoardPreview;
      }

      throw new Error("Board already exists but could not be reloaded");
    }

    const boardId = insertedBoard.id as string;

    const { data: insertedCategories, error: categoriesError } =
      await supabaseAdmin
        .from("movie_buff_board_categories")
        .insert(
          draft.categories.map((category, index) => ({
            board_id: boardId,
            display_order: index,
            label: category.label,
            era_bucket: category.eraBucket,
            primary_genre: category.primaryGenre,
          })),
        )
        .select("id, display_order");

    if (categoriesError || !insertedCategories) {
      throw new Error(
        categoriesError?.message ?? "Failed to create board categories",
      );
    }

    const categoryIdByOrder = new Map<number, string>(
      insertedCategories.map((category) => [
        category.display_order as number,
        category.id as string,
      ]),
    );

    const tilesToInsert = draft.categories.flatMap(
      (category, categoryIndex) =>
        category.tiles.map((tile, tileIndex) => {
          const boardCategoryId =
            categoryIdByOrder.get(categoryIndex);

          if (!boardCategoryId) {
            throw new Error("Board category mapping failed");
          }

          return {
            board_id: boardId,
            board_category_id: boardCategoryId,
            tile_order: tileIndex,
            band: tile.band,
            point_value: tile.pointValue,
            clip_id: tile.clipId ?? null,
            content_media_id: tile.contentMediaId ?? null,
          };
        }),
    );

    const { error: tilesError } = await supabaseAdmin
      .from("movie_buff_board_tiles")
      .insert(tilesToInsert);

    if (tilesError) {
      throw new Error(tilesError.message);
    }

    await supabaseAdmin.from("movie_buff_board_events").insert({
      board_id: boardId,
      room_id: roomId,
      player_id: selectorPlayerId,
      event_type: "board_created",
      payload: {
        categoryCount: draft.categoryCount,
        tileCount: draft.tileCount,
      },
    });

    const persistedBoardPreview =
      await loadPersistedBoardPreview(
        roomId,
        roomPlayers,
      );

    if (!persistedBoardPreview) {
      throw new Error(
        "Board created but could not be reloaded",
      );
    }

    return persistedBoardPreview;
  } catch (error) {
    const recoveredBoardPreview =
      await waitForPersistedBoardPreview(
        roomId,
        roomPlayers,
      ).catch(() => null);

    if (recoveredBoardPreview) {
      return recoveredBoardPreview;
    }

    throw error;
  }
}

export async function selectMovieBuffBoardTile(input: {
  roomId: string;
  tileId: string;
}): Promise<{
  boardId: string;
  tileId: string;
  contentMediaId: string | null;
}> {
  const board = await getPersistedBoard(input.roomId);

  if (!board) {
    throw new Error("Board not found for this room.");
  }

  if (board.current_tile_id) {
    throw new Error("A tile is already locked for this room.");
  }

  const roomPlayers = await listRoomPlayers(input.roomId);
  const selectorPlayerId =
    board.selector_player_id ?? roomPlayers[0]?.player_id ?? null;

  const selectedCategory =
    board.movie_buff_board_categories?.find((category) =>
      category.movie_buff_board_tiles?.some(
        (tile) => tile.id === input.tileId,
      ),
    ) ?? null;

  const selectedTile =
    selectedCategory?.movie_buff_board_tiles?.find(
      (tile) => tile.id === input.tileId,
    ) ?? null;

  if (!selectedTile) {
    throw new Error("Tile not found on this board.");
  }

  if (selectedTile.is_used) {
    throw new Error("That tile has already been used.");
  }

  const { error: tileUpdateError } = await supabaseAdmin
    .from("movie_buff_board_tiles")
    .update({
      selected_by_player_id: selectorPlayerId,
      locked_at: new Date().toISOString(),
    })
    .eq("id", input.tileId)
    .eq("board_id", board.id)
    .eq("is_used", false);

  if (tileUpdateError) {
    throw new Error(tileUpdateError.message);
  }

  const { error: boardUpdateError } = await supabaseAdmin
    .from("movie_buff_boards")
    .update({
      current_tile_id: input.tileId,
      status: "active",
      selector_player_id: selectorPlayerId,
      started_at: new Date().toISOString(),
    })
    .eq("id", board.id)
    .is("current_tile_id", null);

  if (boardUpdateError) {
    throw new Error(boardUpdateError.message);
  }

  await supabaseAdmin.from("movie_buff_board_events").insert([
    {
      board_id: board.id,
      room_id: input.roomId,
      tile_id: input.tileId,
      player_id: selectorPlayerId,
      event_type: "tile_selected",
      payload: {
        pointValue: selectedTile.point_value,
        band: selectedTile.band,
        categoryLabel: selectedCategory?.label ?? null,
      },
    },
    {
      board_id: board.id,
      room_id: input.roomId,
      tile_id: input.tileId,
      player_id: selectorPlayerId,
      event_type: "tile_locked",
      payload: {
        pointValue: selectedTile.point_value,
        band: selectedTile.band,
      },
    },
  ]);

  return {
    boardId: board.id,
    tileId: input.tileId,
    contentMediaId: selectedTile.content_media_id,
  };
}

export async function resolveMovieBuffBoardAfterRound(input: {
  roomId: string;
}) {
  const board = await getPersistedBoard(input.roomId);

  if (!board || !board.current_tile_id) {
    return {
      boardResolved: false,
      boardId: board?.id ?? null,
      nextSelectorPlayerId: board?.selector_player_id ?? null,
      status: board?.status ?? null,
      tileId: null,
      tilesUsedCount: board?.tiles_used_count ?? 0,
    };
  }

  const roomPlayers = await listRoomPlayers(input.roomId);
  const activePlayers = roomPlayers.filter(Boolean);
  const currentSelectorIndex = activePlayers.findIndex(
    (player) => player.player_id === board.selector_player_id,
  );
  const nextSelectorPlayerId =
    activePlayers.length === 0
      ? null
      : currentSelectorIndex >= 0
        ? activePlayers[
            (currentSelectorIndex + 1) % activePlayers.length
          ]?.player_id ?? null
        : activePlayers[0]?.player_id ?? null;

  const selectedTileCategory =
    board.movie_buff_board_categories?.find((category) =>
      category.movie_buff_board_tiles?.some(
        (tile) => tile.id === board.current_tile_id,
      ),
    ) ?? null;
  const selectedTile =
    selectedTileCategory?.movie_buff_board_tiles?.find(
      (tile) => tile.id === board.current_tile_id,
    ) ?? null;

  if (!selectedTile) {
    throw new Error("Current board tile could not be found.");
  }

  const nextTilesUsedCount = Math.min(
    board.tiles_used_count + 1,
    board.total_tiles_count,
  );
  const boardCompleted =
    nextTilesUsedCount >= board.total_tiles_count;
  const nextBoardStatus = boardCompleted ? "completed" : "ready";
  const resolvedAt = new Date().toISOString();

  const { error: tileUpdateError } = await supabaseAdmin
    .from("movie_buff_board_tiles")
    .update({
      is_used: true,
      resolved_by_player_id: board.selector_player_id,
      resolved_at: resolvedAt,
    })
    .eq("id", board.current_tile_id)
    .eq("board_id", board.id)
    .eq("is_used", false);

  if (tileUpdateError) {
    throw new Error(tileUpdateError.message);
  }

  const { error: boardUpdateError } = await supabaseAdmin
    .from("movie_buff_boards")
    .update({
      current_tile_id: null,
      selector_player_id: boardCompleted
        ? board.selector_player_id
        : nextSelectorPlayerId,
      status: nextBoardStatus,
      tiles_used_count: nextTilesUsedCount,
      completed_at: boardCompleted ? resolvedAt : null,
    })
    .eq("id", board.id);

  if (boardUpdateError) {
    throw new Error(boardUpdateError.message);
  }

  const boardEvents: Array<{
    board_id: string;
    room_id: string;
    tile_id?: string | null;
    player_id?: string | null;
    event_type: string;
    payload: Record<string, unknown>;
  }> = [
    {
      board_id: board.id,
      room_id: input.roomId,
      tile_id: board.current_tile_id,
      player_id: board.selector_player_id,
      event_type: "tile_resolved",
      payload: {
        pointValue: selectedTile.point_value,
        band: selectedTile.band,
        categoryLabel: selectedTileCategory?.label ?? null,
        tilesUsedCount: nextTilesUsedCount,
      },
    },
  ];

  if (boardCompleted) {
    boardEvents.push({
      board_id: board.id,
      room_id: input.roomId,
      player_id: board.selector_player_id,
      event_type: "board_completed",
      payload: {
        tilesUsedCount: nextTilesUsedCount,
      },
    });
  } else {
    boardEvents.push(
      {
        board_id: board.id,
        room_id: input.roomId,
        player_id: nextSelectorPlayerId,
        event_type: "selector_changed",
        payload: {
          nextSelectorPlayerId,
        },
      },
      {
        board_id: board.id,
        room_id: input.roomId,
        player_id: nextSelectorPlayerId,
        event_type: "returned_to_board",
        payload: {
          tilesUsedCount: nextTilesUsedCount,
        },
      },
    );
  }

  await supabaseAdmin
    .from("movie_buff_board_events")
    .insert(boardEvents);

  return {
    boardResolved: true,
    boardId: board.id,
    nextSelectorPlayerId,
    status: nextBoardStatus,
    tileId: board.current_tile_id,
    tilesUsedCount: nextTilesUsedCount,
  };
}

export async function getMovieBuffBoardPreview(): Promise<MovieBuffBoardPreview> {
  const draft = await createMovieBuffBoardDraft();

  return {
    headline: draft.headline,
    supportLine: draft.supportLine,
    currentTurnLabel: "Shaheed picks the next tile",
    boardStatusLabel: `Board 1 of 1 · 0 of ${draft.tileCount} tiles used`,
    players: [
      {
        id: "player-1",
        name: "Shaheed",
        score: 1200,
        tier: "Fanatic",
        isCurrentSelector: true,
      },
      {
        id: "player-2",
        name: "Jordan",
        score: 800,
        tier: "Fan",
        isCurrentSelector: false,
      },
      {
        id: "player-3",
        name: "Casey",
        score: 1600,
        tier: "Fanatic",
        isCurrentSelector: false,
      },
    ],
    categories: draft.categories.map((category) => ({
      id: category.id,
      label: category.label,
      eraBucket: category.eraBucket,
      primaryGenre: category.primaryGenre,
      tiles: category.tiles,
    })),
  };
}
