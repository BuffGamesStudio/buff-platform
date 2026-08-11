import MovieBuffBoardPreviewClient from "@/components/movie-buff/MovieBuffBoardPreviewClient";
import {
  ensureMovieBuffBoardForRoom,
  getMovieBuffBoardPreview,
} from "@/lib/server/movieBuffBoard";

export const dynamic = "force-dynamic";

export default async function MovieBuffBoardPreviewPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams
    ? await searchParams
    : undefined;
  const roomIdValue = resolvedSearchParams?.roomId;
  const roomId =
    typeof roomIdValue === "string" && roomIdValue.trim().length > 0
      ? roomIdValue.trim()
      : null;
  const roundValue = resolvedSearchParams?.round;
  const round =
    typeof roundValue === "string" && roundValue.trim().length > 0
      ? roundValue.trim()
      : null;
  const errorValue = resolvedSearchParams?.error;
  const selectionError =
    typeof errorValue === "string" && errorValue.trim().length > 0
      ? decodeURIComponent(errorValue)
      : null;

  const {
    preview,
    boardLoadError,
  }: {
    preview: Awaited<
      ReturnType<typeof getMovieBuffBoardPreview>
    >;
    boardLoadError: string | null;
  } = await (async () => {
    try {
      return {
        preview: roomId
          ? (await ensureMovieBuffBoardForRoom(roomId)).preview
          : await getMovieBuffBoardPreview(),
        boardLoadError: null,
      };
    } catch (error) {
      return {
        preview: await getMovieBuffBoardPreview(),
        boardLoadError:
          error instanceof Error
            ? error.message
            : "The board could not be prepared right now.",
      };
    }
  })();

  return (
    <MovieBuffBoardPreviewClient
      roomId={roomId}
      round={round}
      preview={preview}
      initialSelectionError={selectionError}
      boardLoadError={boardLoadError}
    />
  );
}
