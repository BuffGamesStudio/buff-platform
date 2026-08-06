"use client";

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

export default function MovieBuffLobbyAuthBootstrap({
  initialCategories,
  initialCategoryError = null,
}: MovieBuffLobbyAuthBootstrapProps) {
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let authResolved = false;

    async function resolvePersistedSession() {
      try {
        const { getCurrentUser } = await import("@/lib/auth/auth");
        const user = await getCurrentUser();

        if (!isMounted || authResolved) {
          return;
        }

        authResolved = true;

        if (!user || user.is_anonymous === true) {
          router.replace(signInPath);
          return;
        }

        setAuthReady(true);
      } catch {
        if (!isMounted || authResolved) {
          return;
        }

        authResolved = true;
        router.replace(signInPath);
      }
    }

    void resolvePersistedSession();

    const retryTimer = window.setTimeout(() => {
      if (!authResolved) {
        void resolvePersistedSession();
      }
    }, 1500);

    return () => {
      isMounted = false;
      window.clearTimeout(retryTimer);
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
