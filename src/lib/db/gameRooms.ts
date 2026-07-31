import { supabase } from "@/lib/supabase";

export interface GameRoom {
  id: string;
  room_code: string;
  host_id: string;
  status: string;
  max_players: number;
  created_at: string;
}

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }

  return code;
}

export async function createGameRoom(
  hostId: string
): Promise<GameRoom> {
  const roomCode = generateRoomCode();

  const { data, error } = await supabase
    .from("game_rooms")
    .insert({
      room_code: roomCode,
      host_id: hostId,
      status: "waiting",
      max_players: 8,
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as GameRoom;
}

export async function getRoomByCode(
  roomCode: string
): Promise<GameRoom | null> {
  const { data, error } = await supabase
    .from("game_rooms")
    .select("*")
    .eq("room_code", roomCode.toUpperCase())
    .single();

  if (error) {
    return null;
  }

  return data as GameRoom;
}

export async function getRoom(
  roomId: string
): Promise<GameRoom | null> {
  const { data, error } = await supabase
    .from("game_rooms")
    .select("*")
    .eq("id", roomId)
    .single();

  if (error) {
    return null;
  }

  return data as GameRoom;
}

export async function closeRoom(roomId: string): Promise<void> {
  const { error } = await supabase
    .from("game_rooms")
    .update({
      status: "finished",
      finished_at: new Date().toISOString(),
    })
    .eq("id", roomId);

  if (error) {
    throw new Error(error.message);
  }
}
