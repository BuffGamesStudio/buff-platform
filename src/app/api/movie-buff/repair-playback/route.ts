import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

export const dynamic = "force-dynamic";

type RepairPlaybackRequest = {
  roomId?: string | null;
};

function getBearerToken(request: Request) {
  const authorizationHeader =
    request.headers.get("authorization");

  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] =
    authorizationHeader.split(" ");

  if (!scheme || !token || !/^Bearer$/i.test(scheme)) {
    return null;
  }

  return token.trim() || null;
}

export async function POST(request: Request) {
  try {
    const accessToken = getBearerToken(request);

    if (!accessToken) {
      return NextResponse.json(
        {
          error:
            "A valid Buff Games session is required.",
        },
        { status: 401 }
      );
    }

    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(
      accessToken
    );

    if (userError || !user) {
      return NextResponse.json(
        {
          error:
            "Your Buff Games session is no longer valid.",
        },
        { status: 401 }
      );
    }

    if (user.is_anonymous === true) {
      return NextResponse.json(
        {
          error:
            "You must sign in with a Buff Games account to continue.",
        },
        { status: 403 }
      );
    }

    const body = (await request
      .json()
      .catch(() => null)) as RepairPlaybackRequest | null;
    const roomId = body?.roomId?.trim() ?? "";

    if (!roomId) {
      return NextResponse.json(
        {
          error: "A roomId is required.",
        },
        { status: 400 }
      );
    }

    const { data: membership, error: membershipError } =
      await supabaseAdmin
        .from("room_players")
        .select("room_id")
        .eq("room_id", roomId)
        .eq("player_id", user.id)
        .is("left_at", null)
        .maybeSingle();

    if (membershipError) {
      throw membershipError;
    }

    if (!membership) {
      return NextResponse.json(
        {
          error:
            "You are not an active player in this room.",
        },
        { status: 403 }
      );
    }

    const { data: room, error: roomError } =
      await supabaseAdmin
        .from("game_rooms")
        .select("current_round")
        .eq("id", roomId)
        .single();

    if (roomError || !room) {
      return NextResponse.json(
        {
          error:
            roomError?.message ??
            "The current room could not be found.",
        },
        { status: 404 }
      );
    }

    const { data: match, error: matchError } =
      await supabaseAdmin
        .from("matches")
        .select("id")
        .eq("room_id", roomId)
        .eq("status", "active")
        .maybeSingle();

    if (matchError) {
      throw matchError;
    }

    if (!match) {
      return NextResponse.json(
        {
          repaired: false,
          roundId: null,
          playbackStartedAt: null,
        },
        { status: 200 }
      );
    }

    const { data: round, error: roundError } =
      await supabaseAdmin
        .from("match_rounds")
        .select(
          "id, round_number, started_at, playback_started_at"
        )
        .eq("match_id", match.id)
        .eq("round_number", room.current_round)
        .maybeSingle();

    if (roundError) {
      throw roundError;
    }

    if (!round) {
      return NextResponse.json(
        {
          repaired: false,
          roundId: null,
          playbackStartedAt: null,
        },
        { status: 200 }
      );
    }

    if (!round.playback_started_at) {
      return NextResponse.json(
        {
          repaired: false,
          roundId: round.id,
          playbackStartedAt: null,
        },
        { status: 200 }
      );
    }

    const playbackTimestamp =
      round.playback_started_at;
    const startedAt =
      round.started_at ??
      round.playback_started_at;

    const { error: playbackError } =
      await supabaseAdmin
        .from("match_round_player_playback")
        .upsert(
          {
            round_id: round.id,
            player_id: user.id,
            started_at: startedAt,
            play_requested_at:
              playbackTimestamp,
            playback_started_at:
              playbackTimestamp,
          },
          {
            onConflict: "round_id,player_id",
          }
        );

    if (playbackError) {
      throw playbackError;
    }

    return NextResponse.json({
      repaired: true,
      roundId: round.id,
      playbackStartedAt:
        playbackTimestamp,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Playback reconciliation failed.",
      },
      { status: 500 }
    );
  }
}
