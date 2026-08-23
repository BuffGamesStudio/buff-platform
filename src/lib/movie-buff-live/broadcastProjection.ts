import type { MovieBuffLiveShowView } from "@/lib/db/movieBuffLiveShow";
import type { MovieBuffBoardPreview } from "@/lib/game/movieBuffBoard";
import {
  getMovieBuffBoardPreview,
  getMovieBuffBoardPreviewForRoom,
} from "@/lib/server/movieBuffBoard";
import { supabase } from "@/lib/supabase";
import {
  getMovieBuffProviderConfiguration,
  type MovieBuffProviderConfiguration,
} from "@/lib/movie-buff-live/providerConfig";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

export const MOVIE_BUFF_BROADCAST_SCHEMA_VERSION = 2;

export type MovieBuffBroadcastCue = {
  hostName: "Cinephile Cinematic";
  mascotName: "Buster";
  mode: "cue_only";
  text: string;
};

export type MovieBuffBroadcastProjection = {
  schemaVersion: number;
  generatedAt: string;
  showKey: string;
  show: MovieBuffLiveShowView;
  board: MovieBuffBroadcastBoard;
  media: MovieBuffBroadcastMedia | null;
  host: MovieBuffBroadcastCue;
  integrations: MovieBuffProviderConfiguration;
};

export type MovieBuffBroadcastBoard = {
  headline: string;
  supportLine: string;
  totalTiles: number;
  categories: Array<{
    id: string;
    label: string;
    tiles: Array<{
      id: string;
      pointValue: number;
      status: "available" | "locked" | "used";
    }>;
  }>;
};

export type MovieBuffBroadcastMedia = {
  roundId: string;
  clipType: "video" | "audio";
  url: string;
};

const SHOW_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

function normalizeShowKey(showKey: string): string {
  const normalized = showKey.trim().toLowerCase();

  if (!SHOW_KEY_PATTERN.test(normalized)) {
    throw new Error("Invalid Movie Buff Live show key.");
  }

  return normalized;
}

function phaseLabel(phase: string | null): string {
  return (phase ?? "casting")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildHostCue(view: MovieBuffLiveShowView): MovieBuffBroadcastCue {
  let text = "Cinephile Cinematic is calling the next three contestants to the stage.";

  if (view.status === "live") {
    const phase = phaseLabel(view.currentPhase);
    text = `Cinephile Cinematic is guiding the contestants through ${phase}. Buster is standing by for the next movie moment.`;
  } else if (view.status === "cooldown") {
    text = "The curtain is between episodes. Buster is resetting the stage for the next three contestants.";
  } else if (view.status === "paused") {
    text = "The Movie Buff stage is paused. Cinephile Cinematic will return when the show resumes.";
  } else if (view.status === "error") {
    text = "The Movie Buff control room needs attention before the next scene can begin.";
  }

  return {
    hostName: "Cinephile Cinematic",
    mascotName: "Buster",
    mode: "cue_only",
    text,
  };
}

function toBroadcastBoard(
  preview: MovieBuffBoardPreview | null,
): MovieBuffBroadcastBoard {
  if (!preview) {
    return {
      headline: "So You Think You’re a Movie Buff?",
      supportLine: "Watch. Guess. Win.",
      totalTiles: 0,
      categories: [],
    };
  }

  const categories = preview.categories.map((category) => ({
    id: category.id,
    label: category.label,
    tiles: category.tiles.map((tile) => ({
      id: tile.id,
      pointValue: tile.pointValue,
      status: tile.status,
    })),
  }));

  return {
    headline: preview.headline,
    supportLine: preview.supportLine,
    totalTiles: categories.reduce(
      (total, category) => total + category.tiles.length,
      0,
    ),
    categories,
  };
}

async function getBroadcastBoard(
  view: MovieBuffLiveShowView,
): Promise<MovieBuffBroadcastBoard> {
  let preview: MovieBuffBoardPreview | null = null;

  if (view.roomId) {
    preview = await getMovieBuffBoardPreviewForRoom(view.roomId).catch(
      () => null,
    );
  }

  if (!preview) {
    preview = await getMovieBuffBoardPreview().catch(() => null);
  }

  return toBroadcastBoard(preview);
}

const MEDIA_PHASES = new Set([
  "transition",
  "playback",
  "answer",
  "results",
]);

async function getBroadcastMedia(
  view: MovieBuffLiveShowView,
): Promise<MovieBuffBroadcastMedia | null> {
  if (
    !view.matchId ||
    !view.currentPhase ||
    !MEDIA_PHASES.has(view.currentPhase)
  ) {
    return null;
  }

  try {
    const { data: phaseState, error: phaseError } = await supabaseAdmin
      .from("movie_buff_match_phase_state")
      .select("round_id, selected_clip_id, phase")
      .eq("match_id", view.matchId)
      .maybeSingle();

    if (phaseError || !phaseState?.round_id) {
      return null;
    }

    let clipId = phaseState.selected_clip_id as string | null;

    if (!clipId) {
      const { data: round, error: roundError } = await supabaseAdmin
        .from("match_rounds")
        .select("clip_id")
        .eq("id", phaseState.round_id)
        .eq("match_id", view.matchId)
        .maybeSingle();

      if (roundError) {
        return null;
      }

      clipId = (round?.clip_id as string | null) ?? null;
    }

    if (!clipId) {
      return null;
    }

    const { data: clip, error: clipError } = await supabaseAdmin
      .from("clips")
      .select("clip_type")
      .eq("id", clipId)
      .maybeSingle();

    if (
      clipError ||
      (clip?.clip_type !== "video" && clip?.clip_type !== "audio")
    ) {
      return null;
    }

    return {
      roundId: phaseState.round_id,
      clipType: clip.clip_type,
      url: `/api/movie-buff/round-media/${encodeURIComponent(phaseState.round_id)}`,
    };
  } catch {
    return null;
  }
}

export async function getMovieBuffBroadcastProjection(
  showKey = "main",
): Promise<MovieBuffBroadcastProjection> {
  const normalizedShowKey = normalizeShowKey(showKey);
  const { data, error } = await supabase.rpc(
    "get_movie_buff_live_show_view",
    { p_show_key: normalizedShowKey },
  );

  if (error) {
    throw new Error("Movie Buff Live broadcast state is unavailable.");
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Movie Buff Live broadcast state was invalid.");
  }

  const view = data as MovieBuffLiveShowView;

  return {
    schemaVersion: MOVIE_BUFF_BROADCAST_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    showKey: normalizedShowKey,
    show: view,
    board: await getBroadcastBoard(view),
    media: await getBroadcastMedia(view),
    host: buildHostCue(view),
    integrations: getMovieBuffProviderConfiguration(),
  };
}
