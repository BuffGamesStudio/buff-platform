import { ensureMovieBuffBoardForRoom as ensureMovieBuffBoardForRoomUnsafe } from "@/lib/server/movieBuffBoard";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

const BOARD_READY_ATTEMPTS = 60;
const BOARD_READY_DELAY_MS = 100;

function isBoardCreationRace(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
  };
  const text = `${String(candidate.message ?? "")} ${String(candidate.details ?? "")}`;
  return (
    candidate.code === "23505" &&
    /movie_buff_boards_room_id_key|movie_buff_boards.*room_id/i.test(text)
  );
}

async function waitForCompletedBoard(roomId: string): Promise<void> {
  for (let attempt = 0; attempt < BOARD_READY_ATTEMPTS; attempt += 1) {
    const { data: board, error: boardError } = await supabaseAdmin
      .from("movie_buff_boards")
      .select("id,total_tiles_count")
      .eq("room_id", roomId)
      .maybeSingle();

    if (boardError) throw boardError;

    if (board) {
      const [categoriesResult, tilesResult] = await Promise.all([
        supabaseAdmin
          .from("movie_buff_board_categories")
          .select("id", { count: "exact", head: true })
          .eq("board_id", board.id),
        supabaseAdmin
          .from("movie_buff_board_tiles")
          .select("id", { count: "exact", head: true })
          .eq("board_id", board.id),
      ]);

      if (categoriesResult.error) throw categoriesResult.error;
      if (tilesResult.error) throw tilesResult.error;

      const categoryCount = categoriesResult.count ?? 0;
      const tileCount = tilesResult.count ?? 0;
      if (categoryCount > 0 && tileCount === board.total_tiles_count) {
        return;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, BOARD_READY_DELAY_MS));
  }

  throw new Error(
    "Movie Buff board bootstrap did not reach a complete persisted state after a concurrent creator won the room lock.",
  );
}

export async function ensureMovieBuffBoardForRoomRaceSafe(
  roomId: string,
): Promise<Awaited<ReturnType<typeof ensureMovieBuffBoardForRoomUnsafe>>> {
  try {
    return await ensureMovieBuffBoardForRoomUnsafe(roomId);
  } catch (error) {
    if (!isBoardCreationRace(error)) throw error;
    await waitForCompletedBoard(roomId);
    return ensureMovieBuffBoardForRoomUnsafe(roomId);
  }
}
