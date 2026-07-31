import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export const DEFAULT_MOVIE_BUFF_ROOM_MAX_PLAYERS = 6;
export const DEFAULT_MOVIE_BUFF_PUBLIC_MATCH_MAX_PLAYERS = 3;

export type RoomType = "public" | "private" | "ai";
export type RoomStatus =
  | "waiting"
  | "starting"
  | "active"
  | "finished"
  | "cancelled";

export type Difficulty = "easy" | "medium" | "hard" | "expert" | "mixed";

export interface CreateRoomInput {
  hostId: string;
  roomType?: RoomType;
  categoryId?: string | null;
  difficulty?: Difficulty;
  totalRounds?: number;
  maxPlayers?: number;
  isRanked?: boolean;
}

export interface GameRoom {
  id: string;
  room_code: string;
  host_id: string;
  room_type: RoomType;
  status: RoomStatus;
  category_id: string | null;
  category_name?: string | null;
  difficulty: Difficulty;
  total_rounds: number;
  max_players: number;
  current_round: number;
  is_ranked: boolean;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface MovieBuffCategoryOption {
  id: string | null;
  name: string;
  slug: string;
  description: string | null;
  playableClipCount: number;
}

export interface RoomPlayer {
  room_id: string;
  player_id: string;
  is_ready: boolean;
  is_host: boolean;
  score: number;
  lives: number;
  current_streak: number;
  joined_at: string;
  left_at: string | null;
  profiles?: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    level: number;
  } | null;
}

export interface LobbyData {
  room: GameRoom;
  players: RoomPlayer[];
}

export async function listPublicMovieBuffCategories(): Promise<
  MovieBuffCategoryOption[]
> {
  const response = await fetch(
    "/api/movie-buff/categories",
    {
      cache: "no-store",
    },
  );
  const payload = (await response
    .json()
    .catch(() => ({}))) as {
    categories?: MovieBuffCategoryOption[];
    error?: string;
  };

  if (!response.ok) {
    throw new Error(
      payload.error ??
        "The categories could not be loaded.",
    );
  }

  return payload.categories ?? [];
}

function createRoomCode(length = 6): string {
  const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  return Array.from({ length }, () => {
    const index = Math.floor(Math.random() * characters.length);
    return characters[index];
  }).join("");
}

export async function createRoom(
  input: CreateRoomInput
): Promise<GameRoom> {
  const roomCode = createRoomCode();

  const { data: room, error: roomError } = await supabase
    .from("game_rooms")
    .insert({
      room_code: roomCode,
      host_id: input.hostId,
      room_type: input.roomType ?? "private",
      category_id: input.categoryId ?? null,
      difficulty: input.difficulty ?? "medium",
      total_rounds: input.totalRounds ?? 10,
      max_players:
        input.maxPlayers ??
        DEFAULT_MOVIE_BUFF_ROOM_MAX_PLAYERS,
      is_ranked: input.isRanked ?? false,
    })
    .select()
    .single();

  if (roomError) {
    throw new Error(roomError.message);
  }

  const { error: playerError } = await supabase
    .from("room_players")
    .insert({
      room_id: room.id,
      player_id: input.hostId,
      is_ready: false,
      is_host: true,
    });

  if (playerError) {
    await supabase.from("game_rooms").delete().eq("id", room.id);
    throw new Error(playerError.message);
  }

  return room as GameRoom;
}

export async function findOrCreatePublicRoom(input: {
  categoryId?: string | null;
  difficulty?: Difficulty;
  totalRounds?: number;
  maxPlayers?: number;
  playerId?: string | null;
}): Promise<GameRoom> {
  const { data: room, error } = await supabase.rpc(
    "find_or_create_movie_buff_public_room",
    {
      p_category_id: input.categoryId ?? null,
      p_difficulty: input.difficulty ?? "medium",
      p_total_rounds: input.totalRounds ?? 10,
      p_max_players:
        input.maxPlayers ??
        DEFAULT_MOVIE_BUFF_ROOM_MAX_PLAYERS,
    }
  )
  .single();

  if (error || !room) {
    throw new Error(
      error?.message ??
        "Unable to find a public match right now."
    );
  }

  const typedRoom = room as GameRoom & {
    created_new?: boolean | null;
  };

  return typedRoom;
}

export async function joinRoom(
  roomCode: string,
  playerId: string
): Promise<GameRoom> {
  void playerId;
  const normalizedCode = roomCode.trim().toUpperCase();

  const { data: room, error } = await supabase.rpc(
    "join_movie_buff_room",
    {
      p_room_code: normalizedCode,
    }
  )
  .single();

  if (error || !room) {
    throw new Error(
      error?.message ??
        "Room not found or is no longer accepting players."
    );
  }

  const typedRoom = room as GameRoom;

  return typedRoom;
}

export async function leaveRoom(
  roomId: string,
  playerId: string
): Promise<void> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error(
      authError?.message ??
        "You must be signed in to leave this room."
    );
  }

  if (user.id !== playerId) {
    throw new Error(
      "You can only leave the room as the signed-in player."
    );
  }

  await leaveCurrentRoom(roomId);
}

export async function leaveCurrentRoom(
  roomId: string
): Promise<void> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error(
      authError?.message ??
        "You must be signed in to leave this room."
    );
  }

  const { error } = await supabase.rpc(
    "leave_movie_buff_room",
    {
      p_room_id: roomId,
    }
  );

  if (error) {
    throw new Error(error.message);
  }
}

export async function touchMovieBuffRoomPresence(
  roomId: string
): Promise<void> {
  const { error } = await supabase.rpc(
    "touch_movie_buff_room_presence",
    {
      p_room_id: roomId,
    }
  );

  if (error) {
    throw new Error(error.message);
  }
}

export async function setPlayerReady(
  roomId: string,
  playerId: string,
  isReady: boolean
): Promise<void> {
  void playerId;

  const { error } = await supabase.rpc(
    "set_movie_buff_player_ready",
    {
      p_room_id: roomId,
      p_is_ready: isReady,
    }
  );

  if (error) {
    throw new Error(error.message);
  }

}

export async function startRoom(
  roomId: string,
  playerId: string
): Promise<void> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error(
      authError?.message ?? "You must be signed in."
    );
  }

  if (user.id !== playerId) {
    throw new Error("You can only start a match as the signed-in player.");
  }

  const { error } = await supabase.rpc(
    "start_movie_buff_match",
    {
      p_room_id: roomId,
    }
  );

  if (error) {
    throw new Error(error.message);
  }

}

export async function getLobby(roomId: string): Promise<LobbyData> {
  const { data: room, error: roomError } = await supabase
    .from("game_rooms")
    .select("*")
    .eq("id", roomId)
    .maybeSingle();

  if (roomError || !room) {
    throw new Error(
      roomError?.message ??
        "Room not found or you are not a member of this room."
    );
  }

  const { data: players, error: playersError } = await supabase
    .from("room_players")
    .select(`
      room_id,
      player_id,
      is_ready,
      is_host,
      score,
      lives,
      current_streak,
      joined_at,
      left_at,
      profiles (
        username,
        display_name,
        avatar_url,
        level
      )
    `)
    .eq("room_id", roomId)
    .is("left_at", null)
    .order("joined_at", { ascending: true });

  if (playersError) {
    throw new Error(playersError.message);
  }

  return {
    room: {
      ...(room as GameRoom),
      category_name: null,
    },
    players: (players ?? []) as unknown as RoomPlayer[],
  };
}

export function subscribeToLobby(
  roomId: string,
  onChange: () => void
): RealtimeChannel {
  return supabase
    .channel(`movie-buff-room-${roomId}`)
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

export async function unsubscribeFromLobby(
  channel: RealtimeChannel
): Promise<void> {
  await supabase.removeChannel(channel);
}

export async function submitAnswer(input: {
  roundId: string;
  playerId: string;
  submittedAnswer: string;
  isCorrect: boolean;
  responseTimeMs: number;
  basePoints: number;
  speedBonus?: number;
  streakBonus?: number;
}): Promise<void> {
  const { error } = await supabase.from("answers").upsert(
    {
      round_id: input.roundId,
      player_id: input.playerId,
      submitted_answer: input.submittedAnswer.trim(),
      is_correct: input.isCorrect,
      response_time_ms: input.responseTimeMs,
      base_points: input.basePoints,
      speed_bonus: input.speedBonus ?? 0,
      streak_bonus: input.streakBonus ?? 0,
    },
    {
      onConflict: "round_id,player_id",
    }
  );

  if (error) {
    throw new Error(error.message);
  }
}

export async function updatePlayerScore(input: {
  roomId: string;
  playerId: string;
  score: number;
  lives: number;
  currentStreak: number;
}): Promise<void> {
  const { error } = await supabase
    .from("room_players")
    .update({
      score: input.score,
      lives: input.lives,
      current_streak: input.currentStreak,
    })
    .eq("room_id", input.roomId)
    .eq("player_id", input.playerId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function finishRoom(
  roomId: string,
  hostId: string
): Promise<void> {
  const { error } = await supabase
    .from("game_rooms")
    .update({
      status: "finished",
      finished_at: new Date().toISOString(),
    })
    .eq("id", roomId)
    .eq("host_id", hostId);

  if (error) {
    throw new Error(error.message);
  }
}

