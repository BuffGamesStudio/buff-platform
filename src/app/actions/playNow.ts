"use client";

import { getCurrentUser } from "@/lib/auth/auth";

export async function playNow(): Promise<void> {
  const user = await getCurrentUser();

  if (!user || user.is_anonymous === true) {
    window.location.href =
      "/sign-in?next=%2Faccount";
    return;
  }

  window.location.href = "/account";
}
