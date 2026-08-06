"use client";

import type { User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import MovieBuffLobbyClient from "@/app/games/movie-buff/lobby/LobbyClient";
import type { MovieBuffCategoryOption } from "@/lib/db/movieBuff";

type MovieBuffLobbyAuthBootstrapProps = {
  initialCategories: MovieBuffCategoryOption[];
  initialCategoryError?: string | null;
};

const lobbyPath = "/games/movie-buff/lobby";
const signInPath = `/sign-in?next=${encodeURIComponent(lobbyPath)}`;
const persistedSessionGraceMs = 1500;

export default function MovieBuffLobbyAuthBootstrap({
  initialCategories,
  initialCategoryError = null,
}: MovieBuffLobbyAuthBootstrapProps) {
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let authResolved = false;
    let retryTimer: number | null = null;
    let unsubscribe: (() => void) | null = null;

    function clearRetryTimer() {
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
        retryTimer = null;
      }
    }

    function redirectFailClosed() {
      if (!isMounted || authResolved) {
        return;
      }

      authResolved = true;
      clearRetryTimer();
      router.replace(signInPath);
    }

    function resolveUser(user: User | null): boolean {
      if (!isMounted || authResolved) {
        return true;
      }

      if (user === null) {
        return false;
      }

      authResolved = true;
      clearRetryTimer();

      if (user.is_anonymous === true) {
        router.replace(signInPath);
        return true;
      }

      setAuthReady(true);
      return true;
    }

    async function resolvePersistedSession() {
      try {
        const {
          getCurrentUser,
          subscribeToAuthChanges,
        } = await import("@/lib/auth/auth");

        if (!isMounted || authResolved) {
          return;
        }

        unsubscribe = subscribeToAuthChanges((_event, session) => {
          resolveUser(session?.user ?? null);
        });

        const user = await getCurrentUser();

        if (resolveUser(user)) {
          return;
        }

        retryTimer = window.setTimeout(() => {
          void (async () => {
            try {
              const retryUser = await getCurrentUser();

              if (resolveUser(retryUser)) {
                return;
              }
            } catch {
              // The bounded retry below remains fail-closed.
            }

            redirectFailClosed();
          })();
        }, persistedSessionGraceMs);
      } catch {
        redirectFailClosed();
      }
    }

    void resolvePersistedSession();

    return () => {
      isMounted = false;
      clearRetryTimer();
      unsubscribe?.();
    };
  }, [router]);

  if (!authReady) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <div className="text-center">
          <p className="text-2xl font-black">
            Checking your Buff Games account...
          </p>
        </div>
      </main>
    );
  }

  return (
    <MovieBuffLobbyClient
      initialCategories={initialCategories}
      initialCategoryError={initialCategoryError}
    />
  );
}
