"use client";

import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

const MEDIA_SELECTOR = '[data-testid="movie-buff-shared-media"]';
const AUTOPLAY_RETRY_DELAYS_MS = [0, 100, 400, 1_000] as const;

function currentMediaElements() {
  return [...document.querySelectorAll(MEDIA_SELECTOR)].filter(
    (element): element is HTMLMediaElement =>
      element instanceof HTMLMediaElement,
  );
}

export function MovieBuffMediaAutoplayPolicy() {
  const [hasMedia, setHasMedia] = useState(false);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const prepared = new WeakSet<HTMLMediaElement>();
    const retryTimers = new Set<number>();
    const cleanupListeners = new Map<HTMLMediaElement, () => void>();

    const attempt = (media: HTMLMediaElement) => {
      if (media.readyState < HTMLMediaElement.HAVE_METADATA) {
        return;
      }

      void media.play().catch(() => undefined);
    };

    const prepare = (media: HTMLMediaElement) => {
      if (prepared.has(media)) {
        return;
      }

      prepared.add(media);
      media.defaultMuted = true;
      media.muted = true;
      media.autoplay = true;
      media.preload = "auto";
      media.setAttribute("muted", "");
      media.setAttribute("autoplay", "");
      media.setAttribute("preload", "auto");

      if (media instanceof HTMLVideoElement) {
        media.playsInline = true;
        media.setAttribute("playsinline", "");
      }

      const retry = () => attempt(media);
      media.addEventListener("loadedmetadata", retry);
      media.addEventListener("loadeddata", retry);
      media.addEventListener("canplay", retry);
      cleanupListeners.set(media, () => {
        media.removeEventListener("loadedmetadata", retry);
        media.removeEventListener("loadeddata", retry);
        media.removeEventListener("canplay", retry);
      });

      for (const delay of AUTOPLAY_RETRY_DELAYS_MS) {
        const timer = window.setTimeout(() => {
          retryTimers.delete(timer);
          attempt(media);
        }, delay);
        retryTimers.add(timer);
      }
    };

    const synchronize = () => {
      const media = currentMediaElements();
      setHasMedia(media.length > 0);
      media.forEach(prepare);
    };

    synchronize();
    const observer = new MutationObserver(synchronize);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      for (const timer of retryTimers) {
        window.clearTimeout(timer);
      }
      cleanupListeners.forEach((cleanup) => cleanup());
    };
  }, []);

  function toggleSound() {
    const nextMuted = !muted;
    setMuted(nextMuted);

    for (const media of currentMediaElements()) {
      media.muted = nextMuted;
      if (!nextMuted) {
        void media.play().catch(() => undefined);
      }
    }
  }

  if (!hasMedia) return null;

  return (
    <button
      type="button"
      onClick={toggleSound}
      aria-pressed={!muted}
      className="fixed right-2 top-2 z-[120] inline-flex max-w-[calc(100vw-1rem)] items-center justify-center gap-2 rounded-xl border border-amber-300/40 bg-black/95 px-4 py-3 text-sm font-black text-amber-100 shadow-2xl outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
    >
      {muted ? (
        <Volume2 aria-hidden="true" size={18} />
      ) : (
        <VolumeX aria-hidden="true" size={18} />
      )}
      {muted ? "Enable clip sound" : "Mute clip sound"}
    </button>
  );
}
