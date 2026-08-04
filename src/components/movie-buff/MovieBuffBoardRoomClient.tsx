"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

type Preview = {
  headline: string;
  supportLine: string;
  currentTurnLabel: string;
  boardStatusLabel: string;
  categories: Array<{
    id: string;
    label: string;
    tiles: Array<{
      id: string;
      pointValue: number;
      tierLabel: string;
      status: "available" | "locked" | "used";
    }>;
  }>;
};

async function postBoard<T>(path: string, body: Record<string, string>) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token || session.user.is_anonymous === true) {
    throw new Error("SIGN_IN_REQUIRED");
  }

  const response = await fetch(path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;

  if (!response.ok) {
    throw new Error(payload?.error ?? "Board action failed.");
  }

  return payload as T;
}

export default function MovieBuffBoardRoomClient({
  roomId,
  round,
}: {
  roomId: string;
  round: string | null;
}) {
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [pendingTile, setPendingTile] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError("");
      const result = await postBoard<{ preview: Preview }>(
        "/api/movie-buff/board/ensure",
        { roomId },
      );
      setPreview(result.preview);
    } catch (loadError) {
      if (loadError instanceof Error && loadError.message === "SIGN_IN_REQUIRED") {
        router.replace(
          `/sign-in?next=${encodeURIComponent(
            `/games/movie-buff/board-preview?roomId=${roomId}${round ? `&round=${round}` : ""}`,
          )}`,
        );
        return;
      }
      setError(loadError instanceof Error ? loadError.message : "Unable to load board.");
    }
  }, [roomId, round, router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function select(tileId: string) {
    try {
      setPendingTile(tileId);
      setError("");
      await postBoard("/api/movie-buff/board/select", { roomId, tileId });
      router.push(
        `/games/movie-buff/play?roomId=${encodeURIComponent(roomId)}${
          round ? `&round=${encodeURIComponent(round)}` : ""
        }`,
      );
    } catch (selectionError) {
      setError(
        selectionError instanceof Error
          ? selectionError.message
          : "Unable to select tile.",
      );
      await load();
    } finally {
      setPendingTile(null);
    }
  }

  if (!preview) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
        <div className="max-w-xl text-center">
          <p className="text-2xl font-black">Loading Movie Buff board...</p>
          {error ? <p className="mt-4 text-red-300">{error}</p> : null}
          {error ? (
            <button className="mt-5 rounded-xl bg-red-600 px-5 py-3 font-black" onClick={() => void load()}>
              Try Again
            </button>
          ) : null}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black px-6 py-10 text-white">
      <section className="mx-auto max-w-[1600px]">
        <div className="rounded-3xl border border-amber-500/25 bg-red-950/30 p-8">
          <p className="text-sm font-black uppercase tracking-[0.3em] text-amber-300">Board-first preview</p>
          <h1 className="mt-4 text-4xl font-black md:text-6xl">{preview.headline}</h1>
          <p className="mt-3 text-zinc-300">{preview.supportLine}</p>
          <p className="mt-5 font-black text-amber-200">{preview.currentTurnLabel}</p>
          <p className="mt-2 text-zinc-400">{preview.boardStatusLabel}</p>
          {error ? <p className="mt-5 text-red-300">{error}</p> : null}
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          {preview.categories.map((category) => (
            <section key={category.id} className="rounded-3xl border border-zinc-800 bg-zinc-950 p-4">
              <h2 className="mb-4 font-black text-amber-100">{category.label}</h2>
              <div className="space-y-3">
                {category.tiles.map((tile) => (
                  <button
                    key={tile.id}
                    type="button"
                    disabled={tile.status !== "available" || pendingTile !== null}
                    onClick={() => void select(tile.id)}
                    className="w-full rounded-2xl border border-red-500/25 bg-black p-4 text-left disabled:opacity-50"
                  >
                    <span className="text-xs uppercase tracking-[0.2em] text-zinc-500">{tile.tierLabel}</span>
                    <span className="mt-2 block text-3xl font-black">{tile.pointValue}</span>
                    <span className="mt-2 block text-xs uppercase text-red-300">
                      {pendingTile === tile.id ? "Locking..." : tile.status}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </main>
  );
}
