import MovieBuffBroadcastClient from "@/components/movie-buff/MovieBuffBroadcastClient";
import { getMovieBuffBroadcastProjection } from "@/lib/movie-buff-live/broadcastProjection";

export const dynamic = "force-dynamic";

export default async function MovieBuffBroadcastPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams
    ? await searchParams
    : undefined;
  const showKeyValue = resolvedSearchParams?.showKey;
  const showKey =
    typeof showKeyValue === "string" && showKeyValue.trim().length > 0
      ? showKeyValue.trim().toLowerCase()
      : "main";

  let initialProjection = null;
  let initialError: string | null = null;

  try {
    initialProjection =
      await getMovieBuffBroadcastProjection(showKey);
  } catch (error) {
    initialError =
      error instanceof Error
        ? error.message
        : "The broadcast scene is unavailable.";
  }

  return (
    <MovieBuffBroadcastClient
      showKey={showKey}
      initialProjection={initialProjection}
      initialError={initialError}
    />
  );
}
