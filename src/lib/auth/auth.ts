import type {
  AuthChangeEvent,
  Session,
  User,
} from "@supabase/supabase-js";

import { getBrowserAppUrl } from "@/lib/appUrl";
import { supabase } from "@/lib/supabase";

export interface PlayerProfileInput {
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  country?: string;
  bio?: string;
}

function getRedirectUrl(): string {
  return `${getBrowserAppUrl()}/games/movie-buff/lobby`;
}

export async function signInAsGuest(): Promise<User> {
  const { data, error } = await supabase.auth.signInAnonymously();

  if (error) {
    throw new Error(error.message);
  }

  if (!data.user) {
    throw new Error("Guest sign-in did not return a user.");
  }

  return data.user;
}

export async function signUpWithEmail(
  email: string,
  password: string,
  displayName?: string
): Promise<User | null> {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: {
        display_name: displayName?.trim() || undefined,
      },
      emailRedirectTo: getRedirectUrl(),
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  return data.user;
}

export async function signInWithEmail(
  email: string,
  password: string
): Promise<User> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data.user) {
    throw new Error("Sign-in did not return a user.");
  }

  return data.user;
}

export async function signInWithGoogle(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: getRedirectUrl(),
    },
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw new Error(error.message);
  }
}

export async function getCurrentSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw new Error(error.message);
  }

  return data.session;
}

export async function getCurrentUser(): Promise<User | null> {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw new Error(error.message);
  }

  return data.session?.user ?? null;
}

export function subscribeToAuthChanges(
  callback: (
    event: AuthChangeEvent,
    session: Session | null
  ) => void
): () => void {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(callback);

  return () => subscription.unsubscribe();
}

export async function updatePlayerProfile(
  userId: string,
  input: PlayerProfileInput
): Promise<void> {
  const updates: Record<string, string> = {};

  if (input.username !== undefined) {
    updates.username = input.username.trim();
  }

  if (input.displayName !== undefined) {
    updates.display_name = input.displayName.trim();
  }

  if (input.avatarUrl !== undefined) {
    updates.avatar_url = input.avatarUrl.trim();
  }

  if (input.country !== undefined) {
    updates.country = input.country.trim();
  }

  if (input.bio !== undefined) {
    updates.bio = input.bio.trim();
  }

  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", userId);

  if (error) {
    throw new Error(error.message);
  }
}
