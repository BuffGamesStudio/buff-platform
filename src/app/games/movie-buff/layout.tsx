import type { ReactNode } from "react";

import { MovieBuffAuthoritativeNavigation } from "@/components/movie-buff/MovieBuffAuthoritativeNavigation";
import { MovieBuffMediaAutoplayPolicy } from "@/components/movie-buff/MovieBuffMediaAutoplayPolicy";

export const dynamic = "force-dynamic";

export default function MovieBuffLayout({
  children,
}: {
  children: ReactNode;
}) {
  const branch = process.env.NEXT_PUBLIC_MOVIE_BUFF_BUILD_BRANCH?.trim();
  const sha = process.env.NEXT_PUBLIC_MOVIE_BUFF_BUILD_SHA?.trim();
  const marker = process.env.NEXT_PUBLIC_MOVIE_BUFF_BUILD_MARKER?.trim();
  const buildIdentity = branch && sha && marker ? `${branch} · ${sha} · ${marker}` : "";

  return (
    <MovieBuffAuthoritativeNavigation>
      {buildIdentity ? (
        <div
          data-testid="movie-buff-build-marker"
          className="fixed bottom-2 left-2 z-[120] max-w-[calc(100vw-1rem)] break-all rounded border border-zinc-700 bg-black/95 px-2 py-1 font-mono text-[10px] leading-4 text-zinc-300"
        >
          {buildIdentity}
        </div>
      ) : null}
      <MovieBuffMediaAutoplayPolicy />
      {children}
    </MovieBuffAuthoritativeNavigation>
  );
}
