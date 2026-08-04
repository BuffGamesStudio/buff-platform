"use client";

import { useEffect, useState, type ReactNode } from "react";

import { MovieBuffRiveCanvas } from "./MovieBuffRiveCanvas";
import { MovieBuffStaticFallback } from "./MovieBuffStaticFallback";

type AssetStatus = "checking" | "ready" | "failed";

export type MovieBuffRiveSurfaceProps = {
  assetSource: string;
  label: string;
  artboard?: string;
  stateMachines?: string | string[];
  canvasClassName?: string;
  children?: ReactNode;
};

/**
 * Fail-closed presentation boundary around the Rive WebGL2 canvas.
 *
 * Asset availability, reduced-motion preference, or renderer failure may only
 * change what is painted. They never change a Movie Buff phase, deadline,
 * selector, score, navigation target, or other authoritative state.
 */
export function MovieBuffRiveSurface({
  assetSource,
  label,
  artboard,
  stateMachines,
  canvasClassName,
  children,
}: MovieBuffRiveSurfaceProps) {
  const [assetStatus, setAssetStatus] = useState<AssetStatus>("checking");
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => setReducedMotion(media.matches);
    syncPreference();
    media.addEventListener("change", syncPreference);
    return () => media.removeEventListener("change", syncPreference);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const normalizedSource = assetSource.trim();

    if (!normalizedSource) {
      setAssetStatus("failed");
      return () => controller.abort();
    }

    setAssetStatus("checking");
    void fetch(normalizedSource, {
      method: "HEAD",
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => setAssetStatus(response.ok ? "ready" : "failed"))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setAssetStatus("failed");
        }
      });

    return () => controller.abort();
  }, [assetSource]);

  if (reducedMotion) {
    return (
      <MovieBuffStaticFallback
        title={label}
        description="Reduced-motion mode is active. The authoritative phase and deadline continue without decorative movement."
      >
        {children}
      </MovieBuffStaticFallback>
    );
  }

  if (assetStatus === "failed") {
    return (
      <MovieBuffStaticFallback
        title={label}
        description="The motion asset or renderer could not load. Gameplay continues from authoritative server state."
      >
        {children}
      </MovieBuffStaticFallback>
    );
  }

  return (
    <div
      data-rive-source={assetSource}
      data-rive-asset-status={assetStatus}
      data-rive-runtime-status={assetStatus === "ready" ? "connected" : "checking"}
      aria-label={label}
      aria-busy={assetStatus === "checking"}
      className="relative min-h-64 overflow-hidden rounded-3xl"
    >
      {assetStatus === "ready" ? (
        <MovieBuffRiveCanvas
          assetSource={assetSource}
          label={label}
          artboard={artboard}
          stateMachines={stateMachines}
          className={canvasClassName}
          onRuntimeError={() => setAssetStatus("failed")}
        />
      ) : null}
      <div className="relative z-10">{children}</div>
      {assetStatus === "checking" ? (
        <span className="sr-only" role="status" aria-live="polite">
          Checking cinematic asset availability.
        </span>
      ) : null}
    </div>
  );
}
