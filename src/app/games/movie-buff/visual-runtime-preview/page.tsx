"use client";

import { useState } from "react";
import { Clapperboard, Menu, ShieldCheck, Sparkles } from "lucide-react";

import {
  MovieBuffBusterReplacement,
  MovieBuffGameMenu,
  MovieBuffTransitionSurface,
  MovieBuffUsedTileStamp,
} from "@/components/movie-buff/visual";

const previewTiles = [
  { value: 100, label: "Opening Scene", used: false },
  { value: 200, label: "Plot Twist", used: true },
  { value: 300, label: "Final Cut", used: false },
];

export default function MovieBuffVisualRuntimePreviewPage() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(127,29,29,0.34),_transparent_42%),linear-gradient(#080202,#020202_72%)] px-5 py-8 text-white">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-5 border-b border-amber-300/20 pb-7 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.34em] text-amber-300">
              <Clapperboard aria-hidden="true" size={17} />
              MOV-18 isolated proof surface
            </p>
            <h1 className="mt-4 max-w-4xl text-4xl font-black uppercase leading-none md:text-7xl">
              Movie Buff visual runtime
            </h1>
            <p className="mt-4 max-w-3xl leading-7 text-zinc-300">
              Presentation-only states for Figma parity, reduced-motion fallback,
              missing assets, Buster replacement, used tiles, and the active match menu.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300/35 bg-amber-300/10 px-5 py-3 font-black text-amber-100 outline-none transition hover:bg-amber-300/15 focus-visible:ring-2 focus-visible:ring-amber-200"
          >
            <Menu aria-hidden="true" size={18} />
            Preview Game Menu
          </button>
        </header>

        <section className="mt-8 grid gap-5 md:grid-cols-3">
          {previewTiles.map((tile) => (
            <article
              key={tile.value}
              aria-disabled={tile.used}
              className={`relative min-h-52 overflow-hidden rounded-3xl border p-6 ${
                tile.used
                  ? "border-zinc-700 bg-zinc-950/85 text-zinc-500"
                  : "border-red-500/30 bg-gradient-to-br from-red-950/60 to-black"
              }`}
            >
              <p className="text-xs font-black uppercase tracking-[0.28em]">
                {tile.label}
              </p>
              <p className="mt-5 text-6xl font-black text-amber-200">{tile.value}</p>
              {tile.used ? (
                <div className="absolute inset-x-5 bottom-5">
                  <MovieBuffUsedTileStamp />
                </div>
              ) : (
                <p className="absolute inset-x-6 bottom-6 text-sm font-bold text-zinc-400">
                  Available to the authoritative selector
                </p>
              )}
            </article>
          ))}
        </section>

        <section className="mt-8 grid gap-8 xl:grid-cols-[1.3fr_0.7fr]">
          <MovieBuffTransitionSurface kind="curtain">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/50 px-4 py-2 text-sm font-bold text-zinc-200">
              <Sparkles aria-hidden="true" size={16} />
              Missing production .riv files fail to this accessible surface
            </span>
          </MovieBuffTransitionSurface>

          <MovieBuffBusterReplacement
            replacedPlayerName="Departed player"
            state="active"
          />
        </section>

        <section className="mt-8 rounded-3xl border border-emerald-400/20 bg-emerald-950/15 p-6">
          <p className="flex items-center gap-2 font-black text-emerald-200">
            <ShieldCheck aria-hidden="true" />
            Authority boundary
          </p>
          <p className="mt-3 max-w-4xl leading-7 text-zinc-300">
            Every control on this route changes local preview presentation only. No room,
            match, tile, phase, playback, VIP, score, penalty, or hosted state is read or
            mutated.
          </p>
        </section>
      </div>

      <MovieBuffGameMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        penaltyLabel="Preview only: the real leave penalty must come from authoritative server state."
      >
        <button
          type="button"
          onClick={() => setMenuOpen(false)}
          className="w-full rounded-xl border border-zinc-700 px-5 py-4 text-left font-black outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
        >
          Return to visual preview
        </button>
        <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-5 py-4 text-sm leading-6 text-red-100">
          Leave Match is deliberately not actionable on this isolated proof route.
        </div>
      </MovieBuffGameMenu>
    </main>
  );
}
