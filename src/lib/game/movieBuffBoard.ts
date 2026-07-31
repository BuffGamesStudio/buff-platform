export const movieBuffBoardTileBands = [
  "fan_200",
  "fan_400",
  "fanatic_600",
  "fanatic_800",
  "buff_1000",
  "buff_1200",
] as const;

export type MovieBuffBoardTileBand =
  (typeof movieBuffBoardTileBands)[number];

export type MovieBuffBoardStatus =
  | "draft"
  | "ready"
  | "active"
  | "completed"
  | "cancelled";

export type MovieBuffBoardTileStatus =
  | "available"
  | "locked"
  | "used";

export type MovieBuffBoardCategoryPreview = {
  id: string;
  label: string;
  eraBucket: string | null;
  primaryGenre: string | null;
  tiles: MovieBuffBoardTilePreview[];
};

export type MovieBuffBoardTilePreview = {
  id: string;
  band: MovieBuffBoardTileBand;
  tierLabel: string;
  label: string;
  pointValue: number;
  status: MovieBuffBoardTileStatus;
  contentMediaId?: string;
  contentTitle?: string | null;
};

export type MovieBuffBoardDraftCategory = {
  id: string;
  categoryId: string;
  label: string;
  slug: string;
  eraBucket: string | null;
  primaryGenre: string | null;
  tiles: MovieBuffBoardTilePreview[];
};

export type MovieBuffBoardDraft = {
  headline: string;
  supportLine: string;
  categoryCount: number;
  tileCount: number;
  categories: MovieBuffBoardDraftCategory[];
};

export const movieBuffBoardBandPresentation: Record<
  MovieBuffBoardTileBand,
  { label: string; points: number }
> = {
  fan_200: {
    label: "Fan - 200",
    points: 200,
  },
  fan_400: {
    label: "Fan - 400",
    points: 400,
  },
  fanatic_600: {
    label: "Buff - 600",
    points: 600,
  },
  fanatic_800: {
    label: "Buff - 800",
    points: 800,
  },
  buff_1000: {
    label: "Buffster - 1000",
    points: 1000,
  },
  buff_1200: {
    label: "Buffster - 1200",
    points: 1200,
  },
};
