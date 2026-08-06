"use client";

import type { ReactNode } from "react";

import {
  mapMovieBuffAuthoritativePhaseToVisualPhase,
  type MovieBuffCanonicalVisualSource,
} from "@/lib/movie-buff/visualRuntime";

import { MovieBuffStaticFallback } from "./MovieBuffStaticFallback";

export function MovieBuffCanonicalVisualAdapter({
  source,
  children,
}: {
  source: MovieBuffCanonicalVisualSource;
  children: ReactNode;
}) {
  const mapping = mapMovieBuffAuthoritativePhaseToVisualPhase(source);

  if (!mapping.valid) {
    return (
      <MovieBuffStaticFallback
        title="Shared visual state unavailable"
        description="The presentation received stale, incomplete, or contradictory authoritative state. Gameplay is not advanced and the visual layer remains fail-closed."
      >
        <div
          role="status"
          data-movie-buff-visual-error={mapping.reason ?? "UNKNOWN_VISUAL_ERROR"}
          data-movie-buff-phase-version={mapping.phaseVersion}
          className="rounded-2xl border border-red-500/30 bg-red-950/25 px-5 py-4 text-sm font-bold text-red-100"
        >
          Visual state code: {mapping.reason ?? "UNKNOWN_VISUAL_ERROR"}
        </div>
      </MovieBuffStaticFallback>
    );
  }

  return (
    <div
      data-movie-buff-visual-phase={mapping.phase}
      data-movie-buff-phase-version={mapping.phaseVersion}
      data-movie-buff-canonical-adapter="passive"
    >
      {children}
    </div>
  );
}
