import type { RealtimeChannel } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";
import {
  getLobby,
  type GameRoom,
  type RoomPlayer,
} from "@/lib/db/movieBuff";

export interface LiveGameState {
  room: GameRoom;
  players: RoomPlayer[];
  currentPlayer: RoomPlayer | null;
}

export interface OpenMovieBuffRoom {
  roomId: string;
  status: GameRoom["status"];
  roomCode: string | null;
}

export function getPlayerName(player: RoomPlayer): string {
  return (
    player.profiles?.display_name?.trim() ||
    player.profiles?.username?.trim() ||
    `Player ${player.player_id.slice(0, 6)}`
  );
}

export async function getCurrentUserId(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.user) {
    if (session.user.is_anonymous === true) {
      throw new Error(
        "You must sign in with a Buff Games account to continue."
      );
    }

    return session.user.id;
  }

  throw new Error(
    "You must sign in with a Buff Games account to continue."
  );
}

export async function findCurrentRoomId(
  playerId: string
): Promise<string | null> {
  const openRoom =
    await findOpenMovieBuffRoom(playerId);

  if (
    !openRoom ||
    !["starting", "active"].includes(
      openRoom.status
    )
  ) {
    return null;
  }

  return openRoom.roomId;
}

export async function findOpenMovieBuffRoom(
  playerId: string
): Promise<OpenMovieBuffRoom | null> {
  const { data, error } = await supabase
    .from("room_players")
    .select(`
      room_id,
      joined_at,
      game_rooms!inner (
        status,
        room_code
      )
    `)
    .eq("player_id", playerId)
    .is("left_at", null)
    .in("game_rooms.status", [
      "waiting",
      "starting",
      "active",
    ])
    .order("joined_at", {
      ascending: false,
    })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  const roomData = Array.isArray(data.game_rooms)
    ? data.game_rooms[0]
    : data.game_rooms;

  if (!roomData) {
    return null;
  }

  return {
    roomId: data.room_id,
    status: roomData.status as GameRoom["status"],
    roomCode:
      roomData.room_code?.trim() || null,
  };
}

export async function loadGameState(
  roomId: string,
  playerId: string
): Promise<LiveGameState> {
  const lobby = await getLobby(roomId);

  return {
    room: lobby.room,
    players: lobby.players,
    currentPlayer:
      lobby.players.find(
        (player) =>
          player.player_id === playerId
      ) ?? null,
  };
}

export function subscribeToGameState(
  roomId: string,
  onChange: () => void
): RealtimeChannel {
  const uniqueChannelName =
    `buff-game-state-${roomId}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;

  return supabase
    .channel(uniqueChannelName)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "game_rooms",
        filter: `id=eq.${roomId}`,
      },
      onChange
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "room_players",
        filter: `room_id=eq.${roomId}`,
      },
      onChange
    )
    .subscribe();
}

export async function unsubscribeFromGameState(
  channel: RealtimeChannel
): Promise<void> {
  await supabase.removeChannel(channel);
}
