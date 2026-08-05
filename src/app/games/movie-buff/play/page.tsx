import { redirect } from "next/navigation";

import MovieBuffAuthoritativePlayClient from "@/components/movie-buff/MovieBuffAuthoritativePlayClient";

export const dynamic = "force-dynamic";

export default async function MovieBuffPlayPage({
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

  return <MovieBuffAuthoritativePlayClient roomId={roomId} />;
}
