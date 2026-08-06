"use client";

import { useState } from "react";
import {
  Clapperboard,
  Eye,
  Film,
  Menu,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

import {
  MovieBuffBusterReplacement,
  MovieBuffCanonicalVisualAdapter,
  MovieBuffGameMenu,
  MovieBuffReconnectVisual,
  MovieBuffTransitionSurface,
  MovieBuffUsedTileStamp,
} from "@/components/movie-buff/visual";

const previewPlayers = [
  { id: "player-a", name: "Avery", score: 1400, state: "Selector" },
  { id: "player-b", name: "Jordan", score: 1100, state: "Ready" },
  { id: "player-c", name: "Morgan", score: 900, state: "Watching" },
];

const previewCategories = [
  {
    id: "openers",
    label: "Opening Shots",
    accent: "from-amber-300/25 to-red-950/20",
    tiles: [
      { id: "openers-100", value: 100, label: "Cold Open", used: false },
      { id: "openers-200", value: 200, label: "Studio Logo", used: true },
      { id: "openers-300", value: 300, label: "First Line", used: false },
    ],
  },
  {
    id: "twists",
    label: "Plot Twists",
    accent: "from-red-500/20 to-black",
    tiles: [
      { id: "twists-100", value: 100, label: "False Lead", used: false },
      { id: "twists-200", value: 200, label: "Hidden Motive", used: false },
      { id: "twists-300", value: 300, label: "Final Reveal", used: true },
    ],
  },
  {
    id: "finales",
    label: "Final Cut",
    accent: "from-zinc-700/20 to-red-950/20",
    tiles: [
      { id: "finales-100", value: 100, label: "Last Look", used: false },
      { id: "finales-200", value: 200, label: "Closing Line", used: false },
      { id: "finales-300", value: 300, label: "End Credits", used: false },
    ],
  },
];

export default function MovieBuffVisualRuntimePreviewPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectorMode, setSelectorMode] = useState(true);
  const [showReconnect, setShowReconnect] = useState(false);
  const [previewNotice, setPreviewNotice] = useState(
    "Preview only: no tile has been submitted.",
  );

  return (
    <main className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,_rgba(127,29,29,0.34),_transparent_42%),linear-gradient(#080202,#020202_72%)] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        <header className="rounded-[2rem] border border-amber-300/20 bg-black/65 p-5 shadow-[0_0_80px_rgba(120,0,0,0.18)] backdrop-blur md:p-7">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.34em] text-amber-300">
                <Clapperboard aria-hidden="true" size={17} />
                MOV-18 isolated proof surface
              </p>
              <h1 className="mt-4 max-w-5xl text-4xl font-black uppercase leading-none sm:text-5xl md:text-7xl">
                Movie Buff visual runtime
              </h1>
              <p className="mt-4 max-w-3xl leading-7 text-zinc-300">
                A passive cinematic presentation layer driven by canonical MOV-17 state.
                This preview preserves board depth, selector emphasis, category identity,
                used-scene treatment, menu, reconnect, curtain, and Buster fallbacks.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setSelectorMode((value) => !value)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900/70 px-4 py-3 font-black outline-none transition hover:border-amber-300/40 focus-visible:ring-2 focus-visible:ring-amber-200"
              >
                <Eye aria-hidden="true" size={18} />
                {selectorMode ? "View observer state" : "View selector state"}
              </button>
              <button
                type="button"
                onClick={() => setShowReconnect((value) => !value)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900/70 px-4 py-3 font-black outline-none transition hover:border-amber-300/40 focus-visible:ring-2 focus-visible:ring-amber-200"
              >
                <Users aria-hidden="true" size={18} />
                {showReconnect ? "Hide reconnect" : "Preview reconnect"}
              </button>
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300/35 bg-amber-300/10 px-5 py-3 font-black text-amber-100 outline-none transition hover:bg-amber-300/15 focus-visible:ring-2 focus-visible:ring-amber-200"
              >
                <Menu aria-hidden="true" size={18} />
                Game Menu
              </button>
            </div>
          </div>
        </header>

        {showReconnect ? (
          <div className="mt-5" data-preview-reconnect-overlay="true">
            <MovieBuffReconnectVisual message="Restoring the exact board and used-scene state…" />
          </div>
        ) : null}

        <MovieBuffCanonicalVisualAdapter
          source={{
            phase: "board_select",
            phaseVersion: 42,
            lastAcceptedPhaseVersion: 41,
            selectedTileId: null,
            transitionPresentation: null,
            selectorControllerType: "human",
            selectorPlayerId: "player-a",
            terminalFallback: null,
          }}
        >
          <section className="mt-6 overflow-hidden rounded-[2.25rem] border border-zinc-800 bg-[linear-gradient(180deg,rgba(20,20,20,0.98),rgba(3,3,3,1))] shadow-[0_0_90px_rgba(127,29,29,0.2)]">
            <div className="border-b border-zinc-800 bg-[linear-gradient(90deg,rgba(120,0,0,0.45),rgba(0,0,0,0.2),rgba(120,0,0,0.45))] px-5 py-4 text-center">
              <p className="text-xs font-black uppercase tracking-[0.42em] text-amber-300">
                Scene Board · Phase v42
              </p>
              <h2 className="mt-2 text-2xl font-black uppercase sm:text-3xl">
                {selectorMode ? "Avery selects the next scene" : "Waiting for Avery to select"}
              </h2>
            </div>

            <div className="grid gap-0 xl:grid-cols-[18rem_1fr]">
              <aside className="border-b border-zinc-800 bg-black/55 p-5 xl:border-b-0 xl:border-r">
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.28em] text-zinc-500">
                  <Users aria-hidden="true" size={16} />
                  Player status
                </p>
                <div className="mt-5 space-y-3">
                  {previewPlayers.map((player, index) => (
                    <article
                      key={player.id}
                      className={`rounded-2xl border px-4 py-4 ${
                        index === 0
                          ? "border-amber-300/45 bg-amber-300/10 shadow-[0_0_24px_rgba(252,211,77,0.08)]"
                          : "border-zinc-800 bg-zinc-950/70"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="font-black">{player.name}</p>
                          <p className="mt-1 text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">
                            {player.state}
                          </p>
                        </div>
                        <p className="text-xl font-black text-amber-200">{player.score}</p>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="mt-5 rounded-2xl border border-red-500/20 bg-red-950/20 p-4 text-sm leading-6 text-zinc-300">
                  Selector identity, scores, and readiness are display-only values supplied by the server.
                </div>
              </aside>

              <div className="p-4 sm:p-5 lg:p-7">
                <div className="grid gap-4 md:grid-cols-3">
                  {previewCategories.map((category) => (
                    <section
                      key={category.id}
                      aria-labelledby={`category-${category.id}`}
                      className="overflow-hidden rounded-[1.7rem] border border-zinc-800 bg-zinc-950/80"
                    >
                      <div className={`bg-gradient-to-br ${category.accent} px-4 py-5 text-center`}>
                        <p
                          id={`category-${category.id}`}
                          className="text-sm font-black uppercase tracking-[0.2em] text-amber-100"
                        >
                          {category.label}
                        </p>
                      </div>
                      <div className="grid gap-3 p-4">
                        {category.tiles.map((tile) => (
                          <button
                            key={tile.id}
                            type="button"
                            disabled={tile.used || !selectorMode}
                            aria-label={
                              tile.used
                                ? `${category.label}, ${tile.value} points, scene complete`
                                : selectorMode
                                  ? `Preview ${category.label}, ${tile.value} points, ${tile.label}`
                                  : `${category.label}, ${tile.value} points, waiting for selector`
                            }
                            onClick={() =>
                              setPreviewNotice(
                                `Preview only: ${category.label} ${tile.value} received local focus. No shared state changed.`,
                              )
                            }
                            className={`relative min-h-36 overflow-hidden rounded-2xl border p-4 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-amber-200 ${
                              tile.used
                                ? "cursor-not-allowed border-zinc-800 bg-zinc-950 text-zinc-600 grayscale"
                                : selectorMode
                                  ? "border-red-500/30 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.12),transparent_40%),linear-gradient(145deg,rgba(127,29,29,0.55),rgba(0,0,0,0.95))] hover:-translate-y-0.5 hover:border-amber-300/45"
                                  : "cursor-wait border-zinc-800 bg-zinc-950/80 text-zinc-500"
                            }`}
                          >
                            <span className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400">
                              {tile.label}
                            </span>
                            <span className="mt-4 block text-4xl font-black text-amber-200">
                              {tile.value}
                            </span>
                            {tile.used ? (
                              <span className="absolute inset-x-3 bottom-3">
                                <MovieBuffUsedTileStamp />
                              </span>
                            ) : (
                              <span className="absolute inset-x-4 bottom-4 text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">
                                {selectorMode ? "Select this scene" : "Waiting for selector"}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>

                <p
                  role="status"
                  aria-live="polite"
                  className="mt-5 rounded-2xl border border-zinc-800 bg-black/60 px-4 py-3 text-center text-sm font-bold text-zinc-300"
                >
                  {previewNotice}
                </p>
              </div>
            </div>
          </section>
        </MovieBuffCanonicalVisualAdapter>

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

        <section className="mt-8 grid gap-5 lg:grid-cols-2">
          <article className="rounded-3xl border border-emerald-400/20 bg-emerald-950/15 p-6">
            <p className="flex items-center gap-2 font-black text-emerald-200">
              <ShieldCheck aria-hidden="true" />
              Authority boundary
            </p>
            <p className="mt-3 leading-7 text-zinc-300">
              Every control on this route changes local preview presentation only. No room,
              match, tile, phase, playback, VIP, score, penalty, or hosted state is read or
              mutated. Rive load success or failure cannot advance the shared phase.
            </p>
          </article>
          <article className="rounded-3xl border border-amber-300/20 bg-amber-300/5 p-6">
            <p className="flex items-center gap-2 font-black text-amber-100">
              <Film aria-hidden="true" />
              Production asset boundary
            </p>
            <p className="mt-3 leading-7 text-zinc-300">
              The declared Rive paths are intentionally treated as unverified. Production
              readiness remains UNKNOWN until exact files, artboards, state machines, parse,
              renderer, reduced-motion, and context-loss evidence exist.
            </p>
          </article>
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
