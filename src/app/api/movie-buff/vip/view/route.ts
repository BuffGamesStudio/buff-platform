import { NextResponse } from "next/server";

import {
  MovieBuffVipAuthorizationError,
  requireMovieBuffVipCaller,
} from "@/lib/server/movieBuffVipRouteAuthorization";
import { isMovieBuffVipUuid } from "@/lib/server/movieBuffVipRoutePolicy";

export async function POST(request: Request) {
  try {
    const { client } = await requireMovieBuffVipCaller(request);
    const body = (await request.json()) as { roomId?: unknown; roundId?: unknown };

    if (!isMovieBuffVipUuid(body.roomId) || !isMovieBuffVipUuid(body.roundId)) {
      return NextResponse.json({ error: "A valid room and round are required." }, { status: 400 });
    }

    const { data, error } = await client.rpc("get_movie_buff_vip_round_view", {
      p_room_id: body.roomId,
      p_round_id: body.roundId,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json({ view: data });
  } catch (error) {
    const status = error instanceof MovieBuffVipAuthorizationError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load VIP state." },
      { status },
    );
  }
}
