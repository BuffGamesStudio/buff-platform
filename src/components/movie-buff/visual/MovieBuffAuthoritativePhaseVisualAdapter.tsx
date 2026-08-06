"use client";

import type { ReactNode } from "react";

import {
  adaptMovieBuffAuthoritativePhaseViewToVisualSource,
  MOVIE_BUFF_AUTHORITATIVE_VISUAL_SCHEMA_VERSION,
  type MovieBuffAuthoritativePhaseViewForVisuals,
} from "@/lib/movie-buff/authoritativeVisualAdapter";
import type { MovieBuffTransitionPresentation } from "@/lib/movie-buff/visualRuntime";

import { MovieBuffCanonicalVisualAdapter } from "./MovieBuffCanonicalVisualAdapter";
import { MovieBuffStaticFallback } from "./MovieBuffStaticFallback";

export function MovieBuffAuthoritativePhaseVisualAdapter({
  view,
  lastAcceptedPhaseVersion,
  transitionPresentation = null,
  schemaVersion = MOVIE_BUFF_AUTHORITATIVE_VISUAL_SCHEMA_VERSION,
  children,
}: {
  view: MovieBuffAuthoritativePhaseViewForVisuals;
  lastAcceptedPhaseVersion: number | null;
  transitionPresentation?: MovieBuffTransitionPresentation | null;
  schemaVersion?: number;
  children: ReactNode;
}) {
  const adapted = adaptMovieBuffAuthoritativePhaseViewToVisualSource({
    view,
    lastAcceptedPhaseVersion,
    transitionPresentation,
    schemaVersion,
  });

  if (!adapted.valid) {
    return (
      <MovieBuffStaticFallback
        title="Shared visual state unavailable"
        description="The presentation could not safely adapt the authoritative MOV-17 phase view. Gameplay remains server-owned and the visual layer stays fail-closed."
      >
        <div
          role="status"
          data-movie-buff-authoritative-adapter-error={adapted.reason}
          data-movie-buff-authoritative-schema-version={schemaVersion}
          data-movie-buff-phase-version={adapted.phaseVersion}
          className="rounded-2xl border border-red-500/30 bg-red-950/25 px-5 py-4 text-sm font-bold text-red-100"
        >
          Visual adapter code: {adapted.reason}
        </div>
      </MovieBuffStaticFallback>
    );
  }

  return (
    <MovieBuffCanonicalVisualAdapter source={adapted.source}>
      <div
        data-movie-buff-authoritative-view="read-only"
        data-movie-buff-authoritative-schema-version={schemaVersion}
        data-movie-buff-phase-route={view.phaseRoute}
        data-movie-buff-authoritative-server-now={view.serverNow}
      >
        {children}
      </div>
    </MovieBuffCanonicalVisualAdapter>
  );
}
