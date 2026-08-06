"use client";

import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

const MEDIA_SELECTOR = '[data-testid="movie-buff-shared-media"]';

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

    const prepare = (media: HTMLMediaElement) => {
      media.defaultMuted = true;
      media.muted = true;
      media.setAttribute("muted", "");

      if (prepared.has(media)) return;
      prepared.add(media);

      const attempt = () => {
        if (media.readyState >= HTMLMediaElement.HAVE_METADATA) {
          void media.play().catch(() => undefined);
        }
      };

      media.addEventListener("loadedmetadata", attempt);
      media.addEventListener("loadeddata", attempt);
      media.addEventListener("canplay", attempt);
      attempt();
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

    return () => observer.disconnect();
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
