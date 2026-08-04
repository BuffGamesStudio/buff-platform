import { Bot, Film, UserRoundX } from "lucide-react";

import { movieBuffVisualAssets } from "@/lib/movie-buff/visualAssetMap";

import { MovieBuffRiveSurface } from "./MovieBuffRiveSurface";

export type MovieBuffBusterVisualState =
  | "joining"
  | "active"
  | "answering"
  | "results";

const stateCopy: Record<MovieBuffBusterVisualState, string> = {
  joining: "Buster is taking the open seat at the next safe boundary.",
  active: "Buster is holding the abandoned seat for this match.",
  answering: "Buster is playing from server-owned match state.",
  results: "Buster's result is included in the synchronized reveal.",
};

export function MovieBuffBusterReplacement({
  replacedPlayerName,
  state,
}: {
  replacedPlayerName?: string | null;
  state: MovieBuffBusterVisualState;
}) {
  const asset = movieBuffVisualAssets.buster;

  return (
    <MovieBuffRiveSurface
      assetSource={asset.source}
      label={asset.fallbackLabel}
      canvasClassName="absolute inset-0 h-full min-h-80 w-full opacity-55"
    >
      <section
        aria-label="Buster replacement player"
        data-buster-visual-state={state}
        className="relative overflow-hidden rounded-3xl border border-amber-300/35 bg-[radial-gradient(circle_at_top,_rgba(245,158,11,0.18),_transparent_56%),linear-gradient(145deg,rgba(24,17,10,0.9),rgba(9,9,9,0.94)_62%)] p-6 text-white shadow-2xl"
      >
        <div className="absolute right-5 top-5 rounded-full border border-amber-200/30 bg-black/60 p-3 text-amber-200">
          <Bot aria-hidden="true" size={28} />
        </div>

        <p className="text-xs font-black uppercase tracking-[0.3em] text-amber-300">
          Buster replacement
        </p>
        <h2 className="mt-3 pr-16 text-3xl font-black uppercase">The show goes on</h2>

        <div className="mt-6 flex items-center gap-4 rounded-2xl border border-white/10 bg-black/45 p-4">
          <div className="grid size-14 place-items-center rounded-full border border-red-400/35 bg-red-950/50 text-red-200">
            <UserRoundX aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-zinc-400">
              {replacedPlayerName ? `${replacedPlayerName}'s seat` : "Open player seat"}
            </p>
            <p className="mt-1 font-black text-amber-100">Now played by Buster</p>
          </div>
        </div>

        <p className="mt-5 max-w-xl leading-7 text-zinc-300">{stateCopy[state]}</p>
        <p className="mt-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">
          <Film aria-hidden="true" size={15} />
          Visual only — authority remains on the server
        </p>
      </section>
    </MovieBuffRiveSurface>
  );
}
