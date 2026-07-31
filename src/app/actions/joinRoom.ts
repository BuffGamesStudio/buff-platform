"use client";

import { getCurrentUser } from "@/lib/auth/auth";
import { joinRoom as joinMovieBuffRoom } from "@/lib/db/movieBuff";

export async function joinRoomAction(roomCode: string): Promise<void> {
  const normalizedCode = roomCode.trim().toUpperCase();

  if (!normalizedCode) {
    throw new Error("Enter a room code.");
  }

  const user = await getCurrentUser();

  if (!user || user.is_anonymous === true) {
    const nextTarget = encodeURIComponent(
      `/games/movie-buff/join?code=${normalizedCode}`,
    );
    window.location.href = `/sign-in?next=${nextTarget}`;
    return;
  }

  const room = await joinMovieBuffRoom(normalizedCode, user.id);

  window.location.href =
    `/games/movie-buff/waiting-room?roomId=${room.id}&code=${room.room_code}`;
}
