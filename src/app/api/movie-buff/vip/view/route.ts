import { NextResponse } from "next/server";

import {
  MovieBuffVipAuthorizationError,
  requireMovieBuffVipCaller,
} from "@/lib/server/movieBuffVipRouteAuthorization";
import { isMovieBuffVipUuid } from "@/lib/server/movieBuffVipRoutePolicy";

const VIP_VIEW_STARTUP_ATTEMPTS = 40;
const VIP_VIEW_STARTUP_RETRY_MS = 125;

function isUnavailableVipView(value: unknown) {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    value.status === "unavailable"
  );
}

function waitForVipViewRetry() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, VIP_VIEW_STARTUP_RETRY_MS);
  });
}

export async function POST(request: Request) {
  try {
    const { client } = await requireMovieBuffVipCaller(request);
    const body = (await request.json()) as { roomId?: unknown; roundId?: unknown };

    if (!isMovieBuffVipUuid(body.roomId) || !isMovieBuffVipUuid(body.roundId)) {
      return NextResponse.json({ error: "A valid room and round are required." }, { status: 400 });
    }

    let view: unknown = null;

    for (let attempt = 0; attempt < VIP_VIEW_STARTUP_ATTEMPTS; attempt += 1) {
      const { data, error } = await client.rpc("get_movie_buff_vip_round_view", {
        p_room_id: body.roomId,
        p_round_id: body.roundId,
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }

      view = data;
      if (!isUnavailableVipView(view) || attempt === VIP_VIEW_STARTUP_ATTEMPTS - 1) {
        break;
      }

      await waitForVipViewRetry();
    }

    return NextResponse.json(
      { view },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  } catch (error) {
    const status = error instanceof MovieBuffVipAuthorizationError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load VIP state." },
      { status },
    );
  }
}
