import "server-only";

import {
  ensureMovieBuffBoardForRoom,
  type MovieBuffBoardPreview,
} from "@/lib/server/movieBuffBoard";

const BOARD_RECONCILIATION_ATTEMPTS = 80;
const BOARD_RECONCILIATION_RETRY_MS = 125;

type MovieBuffBoardResult = Awaited<
  ReturnType<typeof ensureMovieBuffBoardForRoom>
>;

type GlobalBoardInitializationState = typeof globalThis & {
  __movieBuffBoardInitializations?: Map<string, Promise<MovieBuffBoardResult>>;
};

const globalBoardInitializationState =
  globalThis as GlobalBoardInitializationState;

function getBoardInitializations() {
  if (!globalBoardInitializationState.__movieBuffBoardInitializations) {
    globalBoardInitializationState.__movieBuffBoardInitializations = new Map();
  }

  return globalBoardInitializationState.__movieBuffBoardInitializations;
}

function isCompleteBoardPreview(preview: MovieBuffBoardPreview) {
  return (
    preview.categories.length > 0 &&
    preview.categories.every(
      (category) =>
        Array.isArray(category.tiles) && category.tiles.length > 0,
    )
  );
}

function isBoardCreationConflict(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("movie_buff_boards_room_id_key") ||
    message.toLowerCase().includes("duplicate key value")
  );
}

function waitForBoardRetry() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, BOARD_RECONCILIATION_RETRY_MS);
  });
}

async function initializeOrReconcileBoard(roomId: string) {
  let lastConflict: unknown = null;

  for (
    let attempt = 0;
    attempt < BOARD_RECONCILIATION_ATTEMPTS;
    attempt += 1
  ) {
    try {
      const board = await ensureMovieBuffBoardForRoom(roomId);
      if (isCompleteBoardPreview(board.preview)) {
        return board;
      }
    } catch (error) {
      if (!isBoardCreationConflict(error)) {
        throw error;
      }
      lastConflict = error;
    }

    await waitForBoardRetry();
  }

  throw new Error(
    lastConflict instanceof Error
      ? `Movie Buff board initialization did not converge: ${lastConflict.message}`
      : "Movie Buff board initialization did not converge.",
  );
}

export function ensureReconciledMovieBuffBoardForRoom(roomId: string) {
  const initializations = getBoardInitializations();
  const activeInitialization = initializations.get(roomId);
  if (activeInitialization) {
    return activeInitialization;
  }

  const initialization = initializeOrReconcileBoard(roomId).finally(() => {
    if (initializations.get(roomId) === initialization) {
      initializations.delete(roomId);
    }
  });

  initializations.set(roomId, initialization);
  return initialization;
}
