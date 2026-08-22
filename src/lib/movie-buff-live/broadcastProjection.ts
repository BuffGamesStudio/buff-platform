import type { MovieBuffLiveShowView } from "@/lib/db/movieBuffLiveShow";
import { supabase } from "@/lib/supabase";
import {
  getMovieBuffProviderConfiguration,
  type MovieBuffProviderConfiguration,
} from "@/lib/movie-buff-live/providerConfig";

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
  host: MovieBuffBroadcastCue;
  integrations: MovieBuffProviderConfiguration;
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
    host: buildHostCue(view),
    integrations: getMovieBuffProviderConfiguration(),
  };
}
