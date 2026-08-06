export type MovieBuffVisualAsset = {
  id: string;
  kind: "rive" | "video" | "image";
  source: string;
  posterSource?: string;
  fallbackLabel: string;
};

export const movieBuffVisualAssets = {
  buster: {
    id: "buster",
    kind: "rive",
    source: "/movie-buff/rive/buster.riv",
    fallbackLabel: "Buster is ready",
  },
  curtain: {
    id: "curtain",
    kind: "rive",
    source: "/movie-buff/rive/curtain.riv",
    fallbackLabel: "Curtain transition",
  },
  filmSlate: {
    id: "film-slate",
    kind: "rive",
    source: "/movie-buff/rive/film-slate.riv",
    fallbackLabel: "Film slate transition",
  },
} satisfies Record<string, MovieBuffVisualAsset>;
