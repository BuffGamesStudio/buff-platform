import { redirect } from "next/navigation";

import MovieBuffAuthoritativeResultsClient from "@/components/movie-buff/MovieBuffAuthoritativeResultsClient";

export const dynamic = "force-dynamic";

export default async function MovieBuffRoundResultsPage({
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

  return <MovieBuffAuthoritativeResultsClient roomId={roomId} />;
}
