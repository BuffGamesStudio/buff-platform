"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import MovieBuffLoadingTicker from "@/components/movie-buff/MovieBuffLoadingTicker";

export default function MovieBuffTransitionShell({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div
        key={pathname}
        aria-hidden="true"
        className="movie-buff-route-loader"
      >
        <MovieBuffLoadingTicker
          variant="page"
          statusLabel="Scene 26 • Take 4"
          title="Action"
          subtitle="Loading the next Movie Buff page."
        />
      </div>

      <div className="relative z-0">{children}</div>
    </div>
  );
}
