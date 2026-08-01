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
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw new Error(sessionError.message);
  }

  const accessToken =
    session?.access_token?.trim() ?? "";

  if (!accessToken) {
    throw new Error(
      "A Movie Buff session is required to record analytics."
    );
  }

  const response = await fetch(
    "/api/movie-buff/events",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        eventType: input.eventType,
        roomId: input.roomId ?? null,
        matchId: input.matchId ?? null,
        roundId: input.roundId ?? null,
        playerId: input.playerId ?? null,
        contentId: input.contentId ?? null,
        contentMediaId:
          input.contentMediaId ?? null,
        legacyClipId:
          input.legacyClipId ?? null,
        payload: input.payload ?? {},
      }),
    }
  );

  const payload = (await response
    .json()
    .catch(() => ({}))) as {
    id?: string;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(
      payload.error ??
        "Movie Buff analytics could not be recorded."
    );
  }

  return String(payload.id ?? "");
}

export function queueMovieBuffEvent(
  input: RecordMovieBuffEventInput
) {
  void recordMovieBuffEvent(input).catch(() => {
    // Analytics logging must not break gameplay.
  });
}
