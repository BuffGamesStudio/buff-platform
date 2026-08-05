import { NextResponse } from "next/server";

import {
  MovieBuffVipAuthorizationError,
  requireMovieBuffVipCaller,
} from "@/lib/server/movieBuffVipRouteAuthorization";
import {
  isMovieBuffVipUuid,
  normalizeMovieBuffVipIdempotencyKey,
} from "@/lib/server/movieBuffVipRoutePolicy";

export async function POST(request: Request) {
  try {
    const { client } = await requireMovieBuffVipCaller(request);
    const body = (await request.json()) as Record<string, unknown>;
    const key = normalizeMovieBuffVipIdempotencyKey(body.activationKey);

    if (
      !isMovieBuffVipUuid(body.roomId) ||
      !isMovieBuffVipUuid(body.roundId) ||
      !key
    ) {
      return NextResponse.json({ error: "Invalid VIP activation request." }, { status: 400 });
    }

    const { data, error } = await client.rpc("activate_movie_buff_round_vip", {
      p_room_id: body.roomId,
      p_round_id: body.roundId,
      p_activation_key: key,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    return NextResponse.json({ activation: data });
  } catch (error) {
    const status = error instanceof MovieBuffVipAuthorizationError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to activate VIP." },
      { status },
    );
  }
}
