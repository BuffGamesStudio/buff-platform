import MovieBuffLobbyAuthBootstrap from "@/app/games/movie-buff/lobby/LobbyAuthBootstrap";
import type { MovieBuffCategoryOption } from "@/lib/db/movieBuff";
import { listMovieBuffLobbyCategories } from "@/lib/server/movieBuffLobby";

export const dynamic = "force-dynamic";

export default async function MovieBuffLobbyPage() {
  let initialCategories: MovieBuffCategoryOption[] = [];
  let initialCategoryError: string | null = null;

  try {
    initialCategories =
      await listMovieBuffLobbyCategories();
  } catch (error) {
    initialCategoryError =
      error instanceof Error
        ? error.message
        : "Unable to load categories.";
  }

  return (
    <MovieBuffLobbyAuthBootstrap
      initialCategories={initialCategories}
      initialCategoryError={initialCategoryError}
    />
  );
}
