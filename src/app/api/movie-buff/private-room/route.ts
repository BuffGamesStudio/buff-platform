import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import {
  createVerifiedUserErrorResponse,
  requireVerifiedUser,
} from "@/lib/server/verifiedAuth";

export const dynamic = "force-dynamic";

function requireEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing ${name}`);
  }

  return value;
}

const supabaseUrl = requireEnv(
  "NEXT_PUBLIC_SUPABASE_URL",
);
const supabasePublishableKey = requireEnv(
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
);
const DEFAULT_PRIVATE_ROOM_MAX_PLAYERS = 6;

type PrivateRoomRequest = {
  categoryId?: string | null;
  difficulty?: string | null;
  totalRounds?: number | null;
  maxPlayers?: number | null;
};

function createRoomCode(length = 6): string {
  const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  return Array.from({ length }, () => {
    const index = Math.floor(Math.random() * characters.length);
    return characters[index];
  }).join("");
}

function getPrivateRoomSettings(
  body: PrivateRoomRequest | null,
) {
  return {
    categoryId: body?.categoryId ?? null,
    difficulty: body?.difficulty ?? "medium",
    totalRounds: Math.max(
      1,
      Math.min(20, Number(body?.totalRounds ?? 10)),
    ),
    maxPlayers: Math.max(
      2,
      Math.min(
        12,
        Number(
          body?.maxPlayers ??
            DEFAULT_PRIVATE_ROOM_MAX_PLAYERS,
        ),
      ),
    ),
  };
}

function createAuthedClient(accessToken: string) {
  return createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

export async function POST(request: Request) {
  try {
    const verifiedUser = await requireVerifiedUser(request);
    const body = (await request
      .json()
      .catch(() => null)) as PrivateRoomRequest | null;
    const settings = getPrivateRoomSettings(body);
    const supabase = createAuthedClient(
      verifiedUser.accessToken,
    );
    const roomCode = createRoomCode();

    const { data: room, error: roomError } = await supabase
      .from("game_rooms")
      .insert({
        room_code: roomCode,
        host_id: verifiedUser.userId,
        room_type: "private",
        category_id: settings.categoryId,
        difficulty: settings.difficulty,
        total_rounds: settings.totalRounds,
        max_players: settings.maxPlayers,
      })
      .select("id, room_code")
      .single();

    if (roomError || !room) {
      return NextResponse.json(
        {
          error:
            roomError?.message ??
            "Private Movie Night could not be created.",
        },
        { status: 403 },
      );
    }

    const { error: playerError } = await supabase
      .from("room_players")
      .insert({
        room_id: room.id,
        player_id: verifiedUser.userId,
        is_ready: false,
        is_host: true,
      });

    if (playerError) {
      await supabase
        .from("game_rooms")
        .delete()
        .eq("id", room.id);

      return NextResponse.json(
        { error: playerError.message },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        room,
      },
      { status: 201 },
    );
  } catch (error) {
    return createVerifiedUserErrorResponse(
      error,
      "Private Movie Night request could not be completed.",
      500,
    );
  }
}
