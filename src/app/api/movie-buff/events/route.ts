import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

export const dynamic = "force-dynamic";

const ALLOWED_EVENT_TYPES = new Set([
  "room_created",
  "player_joined",
  "player_ready",
  "round_started",
  "media_ready",
  "clip_loaded",
  "clip_start_requested",
  "clip_started",
  "hint_requested",
  "answer_submitted",
  "answer_correct",
  "answer_wrong",
  "timeout",
  "player_left",
  "match_completed",
  "match_abandoned",
  "clip_failed_to_load",
]);

type MovieBuffEventRequest = {
  eventType?: string;
  roomId?: string | null;
  matchId?: string | null;
  roundId?: string | null;
  playerId?: string | null;
  payload?: Record<string, unknown> | null;
};

function getBearerToken(request: Request) {
  const authorizationHeader =
    request.headers.get("authorization");

  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(" ");

  if (!scheme || !token || !/^Bearer$/i.test(scheme)) {
    return null;
  }

  return token.trim() || null;
}

function createErrorResponse(
  message: string,
  status: number,
) {
  return NextResponse.json(
    { error: message },
    { status },
  );
}

export async function POST(request: Request) {
  try {
    const accessToken = getBearerToken(request);

    if (!accessToken) {
      return createErrorResponse(
        "A valid Movie Buff session is required.",
        401,
      );
    }

    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(
      accessToken,
    );

    if (authError || !user) {
      return createErrorResponse(
        "Your Movie Buff session is no longer valid.",
        401,
      );
    }

    const body =
      ((await request.json().catch(
        () => null,
      )) as MovieBuffEventRequest | null) ??
      null;

    const eventType = String(
      body?.eventType ?? "",
    ).trim();

    if (!ALLOWED_EVENT_TYPES.has(eventType)) {
      return createErrorResponse(
        "Unsupported Movie Buff event type.",
        400,
      );
    }

    if (
      body?.playerId &&
      body.playerId !== user.id
    ) {
      return createErrorResponse(
        "You can only record your own Movie Buff events.",
        403,
      );
    }

    let roomId = body?.roomId ?? null;
    let matchId = body?.matchId ?? null;
    const roundId = body?.roundId ?? null;
    let legacyClipId: string | null = null;

    if (roundId) {
      const { data: roundRow, error: roundError } =
        await supabaseAdmin
          .from("match_rounds")
          .select("id, match_id, clip_id")
          .eq("id", roundId)
          .maybeSingle();

      if (roundError) {
        return createErrorResponse(
          roundError.message,
          500,
        );
      }

      if (roundRow) {
        matchId =
          matchId ?? roundRow.match_id ?? null;
        legacyClipId =
          roundRow.clip_id ?? null;
      }
    }

    if (matchId) {
      const {
        data: matchRow,
        error: matchError,
      } = await supabaseAdmin
        .from('matches')
        .select('id, room_id')
        .eq('id', matchId)
        .maybeSingle();

      if (matchError) {
        return createErrorResponse(
          matchError.message,
          500,
        );
      }

      if (matchRow) {
        roomId =
          roomId ?? matchRow.room_id ?? null;
      }
    }

    if (roomId) {
      const {
        data: membershipRow,
        error: membershipError,
      } = await supabaseAdmin
        .from("room_players")
        .select("room_id")
        .eq("room_id", roomId)
        .eq("player_id", user.id)
        .is("left_at", null)
        .maybeSingle();

      if (membershipError) {
        return createErrorResponse(
          membershipError.message,
          500,
        );
      }

      if (!membershipRow) {
        return createErrorResponse(
          "You are not an active player in this room.",
          403,
        );
      }
    }

    const { data: insertedRow, error: insertError } =
      await supabaseAdmin
        .from("movie_buff_round_events")
        .insert({
          event_type: eventType,
          room_id: roomId,
          match_id: matchId,
          round_id: roundId,
          player_id: user.id,
          legacy_clip_id: legacyClipId,
          payload: body?.payload ?? {},
        })
        .select("id")
        .single();

    if (insertError) {
      return createErrorResponse(
        insertError.message,
        500,
      );
    }

    return NextResponse.json({
      ok: true,
      id: insertedRow.id,
    });
  } catch (error) {
    return createErrorResponse(
      error instanceof Error
        ? error.message
        : "Movie Buff analytics could not be recorded.",
      500,
    );
  }
}
