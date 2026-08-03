import Link from "next/link";
import { redirect } from "next/navigation";

import {
  ensureMovieBuffBoardForRoom,
  getMovieBuffBoardPreview,
  selectMovieBuffBoardTile,
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
  const { preview, boardLoadError } = await (async () => {
    try {
      const loadedPreview = roomId
        ? (await ensureMovieBuffBoardForRoom(roomId)).preview
        : await getMovieBuffBoardPreview();

      return {
        preview: loadedPreview,
        boardLoadError: null as string | null,
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

  async function handleSelectTile(formData: FormData) {
    "use server";

    const nextRoomId = String(formData.get("roomId") ?? "").trim();
    const nextTileId = String(formData.get("tileId") ?? "").trim();
    const nextRound = String(formData.get("round") ?? "").trim();

    if (!nextRoomId || !nextTileId) {
      redirect("/games/movie-buff/lobby");
    }

    try {
      await selectMovieBuffBoardTile({
        roomId: nextRoomId,
        tileId: nextTileId,
      });

      redirect(
        `/games/movie-buff/play?roomId=${encodeURIComponent(
          nextRoomId,
        )}${nextRound ? `&round=${encodeURIComponent(nextRound)}` : ""}`,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to select that tile.";

      redirect(
        `/games/movie-buff/board-preview?roomId=${encodeURIComponent(
          nextRoomId,
        )}${nextRound ? `&round=${encodeURIComponent(nextRound)}` : ""}&error=${encodeURIComponent(
          message,
        )}`,
      );
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(180,24,24,0.26),_transparent_28%),linear-gradient(180deg,_#080808_0%,_#000000_100%)] text-white">
      <section className="mx-auto max-w-[1600px] px-6 py-10">
        <div className="rounded-[2rem] border border-amber-500/25 bg-gradient-to-b from-red-950/55 via-[#140909] to-black p-8 shadow-[0_0_90px_rgba(239,68,68,0.14)]">
          <p className="text-sm font-black uppercase tracking-[0.35em] text-amber-300/90">
            Board-first preview
          </p>
          <div className="mt-4 flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-4xl">
              <h1 className="text-4xl font-black leading-none md:text-6xl xl:text-7xl">
                {preview.headline}
              </h1>
              <p className="mt-4 text-lg text-zinc-300 md:text-2xl">
                {preview.supportLine}
              </p>
              <p className="mt-4 max-w-3xl text-sm uppercase tracking-[0.26em] text-zinc-500">
                Premium cinematic competition · synchronized clip play ·
                first-correct-wins
              </p>
            </div>

            <div className="grid min-w-[280px] gap-3 md:grid-cols-2 xl:grid-cols-1">
              <BoardStatusCard
                label="Current turn"
                value={preview.currentTurnLabel}
                accent="amber"
              />
              <BoardStatusCard
                label="Board status"
                value={preview.boardStatusLabel}
                accent="red"
              />
            </div>
          </div>

          {selectionError ? (
            <div className="mt-6 max-w-3xl rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm font-bold text-red-200">
              {selectionError}
            </div>
          ) : null}

          {boardLoadError ? (
            <div className="mt-6 max-w-3xl rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm font-bold text-amber-100">
              Board persistence is temporarily unavailable for this room. You can
              continue into the clip round while the board layer is repaired.
            </div>
          ) : null}

          <div className="mt-8 flex flex-wrap gap-4">
            {roomId ? (
              <Link
                href={`/games/movie-buff/play?roomId=${encodeURIComponent(
                  roomId,
                )}${round ? `&round=${encodeURIComponent(round)}` : ""}`}
                className="rounded-xl bg-red-600 px-6 py-3 font-black transition hover:bg-red-700"
              >
                Continue to Clip Round
              </Link>
            ) : null}
            <Link
              href="/games/movie-buff/lobby"
              className="rounded-xl border border-zinc-700 px-6 py-3 font-black text-zinc-200 transition hover:border-amber-400 hover:text-white"
            >
              Current live flow
            </Link>
            <Link
              href="/games/movie-buff/how-to-play"
              className="rounded-xl border border-zinc-700 px-6 py-3 font-black text-zinc-200 transition hover:border-amber-400 hover:text-white"
            >
              How to Play
            </Link>
          </div>
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="space-y-6">
            <div className="rounded-[2rem] border border-amber-500/20 bg-gradient-to-b from-[#161010] to-[#090909] p-6 shadow-[0_0_50px_rgba(245,158,11,0.08)]">
              <p className="text-xs font-black uppercase tracking-[0.3em] text-amber-300/90">
                Scoreboard
              </p>
              <div className="mt-5 space-y-3">
                {preview.players.map((player: NonNullable<typeof preview.players>[number], index) => (
                  <div
                    key={player.id}
                    className={`rounded-2xl border px-4 py-4 ${
                      player.isCurrentSelector
                        ? "border-amber-400/40 bg-amber-500/10"
                        : "border-zinc-800 bg-black/70"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.22em] text-zinc-500">
                          Player {index + 1}
                        </p>
                        <p className="mt-1 text-xl font-black text-white">
                          {player.name}
                        </p>
                        <p className="mt-1 text-sm text-zinc-400">
                          {player.tier}
                        </p>
                      </div>
                      {player.isCurrentSelector ? (
                        <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.22em] text-amber-200">
                          Picking
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-4 flex items-end justify-between">
                      <span className="text-xs uppercase tracking-[0.22em] text-zinc-500">
                        Score
                      </span>
                      <span className="text-3xl font-black text-white">
                        {player.score.toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-red-700/40 bg-gradient-to-br from-red-950/35 via-zinc-950 to-black p-6">
              <p className="text-xs font-black uppercase tracking-[0.3em] text-red-300">
                Launch rule
              </p>
              <p className="mt-3 text-base font-black text-white">
                First correct answer wins the tile.
              </p>
              <p className="mt-3 text-sm leading-6 text-zinc-400">
                Hints are personal. Clip playback starts together for everyone
                from the same server-owned moment in the real implementation.
              </p>
            </div>
          </aside>

          <div className="space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-amber-300">
                  Prototype board
                </h2>
                <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-400">
                  This preview now reflects the intended board-first hierarchy:
                  six categories, six clear tile bands, and a stronger
                  scoreboard/current-turn presentation.
                </p>
                {roomId ? (
                  <p className="mt-3 max-w-4xl text-sm leading-6 text-amber-200/85">
                    This room is using the persisted board bridge. Select a tile
                    to lock it for the room, then continue into the current live
                    clip runtime.
                  </p>
                ) : null}
              </div>
            </div>

            <div className="overflow-hidden rounded-[2rem] border border-zinc-800 bg-gradient-to-b from-[#111111] to-black p-4 shadow-[0_0_70px_rgba(120,0,0,0.14)] xl:p-5">
              <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-6">
                {preview.categories.map((category: NonNullable<typeof preview.categories>[number]) => (
                  <section
                    key={category.id}
                    className="overflow-hidden rounded-[1.7rem] border border-zinc-800 bg-[linear-gradient(180deg,rgba(23,23,23,0.98)_0%,rgba(7,7,7,1)_100%)]"
                  >
                    <div className="border-b border-amber-500/20 bg-[linear-gradient(180deg,rgba(245,158,11,0.16)_0%,rgba(0,0,0,0)_100%)] px-4 py-4">
                      <p className="text-[11px] font-black uppercase tracking-[0.24em] text-zinc-500">
                        Category
                      </p>
                      <h3 className="mt-2 text-lg font-black leading-tight text-amber-100">
                        {category.label}
                      </h3>
                    </div>

                    <div className="grid gap-3 p-4">
                      {category.tiles.map((tile: NonNullable<typeof category.tiles>[number]) => {
                        const isAvailable = tile.status === "available";
                        const isLocked = tile.status === "locked";
                        const isUsed = tile.status === "used";

                        const tileClassName = isUsed
                          ? "border-zinc-800 bg-zinc-950/80 opacity-55"
                          : isLocked
                            ? "border-amber-400/70 bg-[linear-gradient(180deg,rgba(120,70,5,0.4)_0%,rgba(20,10,2,1)_100%)]"
                            : "border-red-500/25 bg-[linear-gradient(180deg,rgba(13,13,13,1)_0%,rgba(0,0,0,1)_100%)] hover:border-amber-400 hover:bg-[linear-gradient(180deg,rgba(53,8,8,1)_0%,rgba(12,3,3,1)_100%)]";

                        const statusLabel = isUsed
                          ? "Used"
                          : isLocked
                            ? "Locked"
                            : "Tile";

                        const body = (
                          <>
                            <div className="flex items-start justify-between gap-3">
                              <span className="block text-[11px] font-black uppercase tracking-[0.22em] text-zinc-500 transition group-hover:text-amber-200">
                                {tile.tierLabel}
                              </span>
                              <span className="rounded-full border border-zinc-800 px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
                                {statusLabel}
                              </span>
                            </div>
                            <span className="mt-3 block text-3xl font-black leading-none text-white">
                              {tile.pointValue}
                            </span>
                            <span className="mt-2 block text-xs uppercase tracking-[0.2em] text-red-300/80">
                              {isAvailable
                                ? "Select to lock this round"
                                : isLocked
                                  ? "This tile is locked for the room"
                                  : "This tile has already been played"}
                            </span>
                          </>
                        );

                        if (!roomId || !isAvailable || boardLoadError) {
                          return (
                            <div
                              key={tile.id}
                              className={`group rounded-[1.35rem] border px-4 py-4 text-left transition ${tileClassName}`}
                            >
                              {body}
                            </div>
                          );
                        }

                        return (
                          <form key={tile.id} action={handleSelectTile}>
                            <input type="hidden" name="roomId" value={roomId} />
                            <input type="hidden" name="tileId" value={tile.id} />
                            <input type="hidden" name="round" value={round ?? ""} />
                            <button
                              type="submit"
                              className={`group w-full rounded-[1.35rem] border px-4 py-4 text-left transition ${tileClassName}`}
                            >
                              {body}
                            </button>
                          </form>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function BoardStatusCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "amber" | "red";
}) {
  return (
    <div
      className={`rounded-2xl border px-4 py-4 ${
        accent === "amber"
          ? "border-amber-400/25 bg-amber-500/10"
          : "border-red-500/25 bg-red-500/10"
      }`}
    >
      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-zinc-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-black leading-6 text-white">
        {value}
      </p>
    </div>
  );
}
