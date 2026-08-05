import type { ReactNode } from "react";

import { movieBuffVisualAssets } from "@/lib/movie-buff/visualAssetMap";

import { MovieBuffRiveSurface } from "./MovieBuffRiveSurface";

export type MovieBuffTransitionKind = "curtain" | "filmSlate";

const transitionCopy: Record<
  MovieBuffTransitionKind,
  { eyebrow: string; title: string; description: string }
> = {
  curtain: {
    eyebrow: "Curtain transition",
    title: "The next scene is loading",
    description:
      "This presentation follows the current server phase and never delays or advances gameplay.",
  },
  filmSlate: {
    eyebrow: "Film slate",
    title: "Picture up",
    description:
      "The synchronized clip begins from the authoritative playback timestamp, not from this animation.",
  },
};

export function MovieBuffTransitionSurface({
  kind,
  children,
}: {
  kind: MovieBuffTransitionKind;
  children?: ReactNode;
}) {
  const asset = movieBuffVisualAssets[kind];
  const copy = transitionCopy[kind];

  return (
    <MovieBuffRiveSurface
      assetSource={asset.source}
      label={asset.fallbackLabel}
      canvasClassName="absolute inset-0 h-full min-h-64 w-full"
    >
      <div className="relative min-h-64 overflow-hidden rounded-3xl border border-red-500/25 bg-[radial-gradient(circle_at_center,_rgba(185,28,28,0.24),_transparent_58%),linear-gradient(135deg,#160303,#030303_70%)] p-8 text-center text-white">
        <div className="mx-auto max-w-2xl">
          <p className="text-xs font-black uppercase tracking-[0.34em] text-amber-300">
            {copy.eyebrow}
          </p>
          <h2 className="mt-4 text-4xl font-black uppercase md:text-6xl">
            {copy.title}
          </h2>
          <p className="mx-auto mt-5 max-w-xl leading-7 text-zinc-300">
            {copy.description}
          </p>
          {children ? <div className="mt-6">{children}</div> : null}
        </div>
      </div>
    </MovieBuffRiveSurface>
  );
}
