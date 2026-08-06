import { redirect } from "next/navigation";

import MovieBuffBoardRoomClient from "@/components/movie-buff/MovieBuffBoardRoomClient";

export const dynamic = "force-dynamic";

export default async function MovieBuffBoardPreviewPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = searchParams ? await searchParams : undefined;
  const roomIdValue = resolved?.roomId;
  const roomId = typeof roomIdValue === "string" ? roomIdValue.trim() : "";

  if (!roomId) {
    redirect("/games/movie-buff/lobby");
  }

  return <MovieBuffBoardRoomClient roomId={roomId} />;
}
