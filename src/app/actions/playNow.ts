"use client";

import { getCurrentUser, signInAsGuest } from "@/lib/auth/auth";

export async function playNow(): Promise<void> {
  let user = await getCurrentUser();

  if (!user) {
    user = await signInAsGuest();
  }

  if (!user) {
    throw new Error("Unable to create a player session.");
  }

  window.location.href = "/games/movie-buff/lobby";
}
