"use client";

import type { ReactNode } from "react";

import {
  deriveMovieBuffVisualRuntimeState,
  type MovieBuffVisualRuntimeInput,
} from "@/lib/movie-buff/visualRuntime";

import { MovieBuffReconnectVisual } from "./MovieBuffReconnectVisual";
import { MovieBuffStaticFallback } from "./MovieBuffStaticFallback";

export function MovieBuffMotionRuntime({
  input,
  children,
  staticTitle,
  staticDescription,
}: {
  input: MovieBuffVisualRuntimeInput;
  children: ReactNode;
  staticTitle: string;
  staticDescription: string;
}) {
  const state = deriveMovieBuffVisualRuntimeState(input);

  if (state.phase === "reconnecting") {
    return <MovieBuffReconnectVisual />;
  }

  if (state.shouldUseStaticFallback) {
    return (
      <MovieBuffStaticFallback
        title={staticTitle}
        description={staticDescription}
      >
        {children}
      </MovieBuffStaticFallback>
    );
  }

  return (
    <div data-movie-buff-visual-phase={state.phase} data-motion-enabled="true">
      {children}
    </div>
  );
}
