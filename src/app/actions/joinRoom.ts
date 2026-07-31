"use client";

import { getCurrentUser, signInAsGuest } from "@/lib/auth/auth";
import { joinRoom as joinMovieBuffRoom } from "@/lib/db/movieBuff";

export async function joinRoomAction(roomCode: string): Promise<void> {
  const normalizedCode = roomCode.trim().toUpperCase();

  if (!normalizedCode) {
    throw new Error("Enter a room code.");
  }

  let user = await getCurrentUser();

  if (!user) {
    user = await signInAsGuest();
  }

  const room = await joinMovieBuffRoom(normalizedCode, user.id);

  window.location.href =
    `/games/movie-buff/waiting-room?roomId=${room.id}&code=${room.room_code}`;
}
