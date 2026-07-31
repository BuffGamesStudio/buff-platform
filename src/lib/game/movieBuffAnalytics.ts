import { supabase } from "@/lib/supabase";

export type MovieBuffEventType =
  | "room_created"
  | "player_joined"
  | "player_ready"
  | "round_started"
  | "media_ready"
  | "clip_loaded"
  | "clip_start_requested"
  | "clip_started"
  | "hint_requested"
  | "answer_submitted"
  | "answer_correct"
  | "answer_wrong"
  | "timeout"
  | "player_left"
  | "match_completed"
  | "match_abandoned"
  | "clip_failed_to_load";

export interface RecordMovieBuffEventInput {
  eventType: MovieBuffEventType;
  roomId?: string | null;
  matchId?: string | null;
  roundId?: string | null;
  playerId?: string | null;
  contentId?: string | null;
  contentMediaId?: string | null;
  legacyClipId?: string | null;
  payload?: Record<string, unknown>;
}

export async function recordMovieBuffEvent(
  input: RecordMovieBuffEventInput
): Promise<string> {
  const { data, error } = await supabase.rpc(
    "record_movie_buff_event",
    {
      p_event_type: input.eventType,
      p_room_id: input.roomId ?? null,
      p_match_id: input.matchId ?? null,
      p_round_id: input.roundId ?? null,
      p_player_id: input.playerId ?? null,
      p_content_id: input.contentId ?? null,
      p_content_media_id:
        input.contentMediaId ?? null,
      p_legacy_clip_id:
        input.legacyClipId ?? null,
      p_payload: input.payload ?? {},
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  return String(data ?? "");
}

export function queueMovieBuffEvent(
  input: RecordMovieBuffEventInput
) {
  void recordMovieBuffEvent(input).catch(() => {
    // Analytics logging must not break gameplay.
  });
}
