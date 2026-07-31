import { headers } from "next/headers";

import MovieLibraryClient from "@/app/admin/movies/MovieLibraryClient";
import type { AdminMovieListItem } from "@/lib/server/movieAdmin";
import { isLocalAdminBypassHeaders } from "@/lib/server/adminAuth";
import { listAdminMovies } from "@/lib/server/movieAdmin";

export const dynamic = "force-dynamic";

export default async function MovieLibraryPage() {
  const requestHeaders = await headers();
  const localBypass =
    isLocalAdminBypassHeaders(requestHeaders);

  if (!localBypass) {
    return (
      <MovieLibraryClient
        initialMovies={[]}
        initialLoaded={false}
      />
    );
  }

  let initialMovies: AdminMovieListItem[] = [];
  let initialError: string | null = null;

  try {
    initialMovies = await listAdminMovies();
  } catch (error) {
    initialError =
      error instanceof Error
        ? error.message
        : "The Movie Library could not be loaded.";
  }

  return (
    <MovieLibraryClient
      initialMovies={initialMovies}
      initialError={initialError}
      initialLoaded
    />
  );
}
