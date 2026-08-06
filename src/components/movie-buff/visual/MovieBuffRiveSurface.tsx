"use client";

import { useEffect, useState, type ReactNode } from "react";

import {
  MovieBuffRiveCanvas,
  type MovieBuffRiveFailureReason,
} from "./MovieBuffRiveCanvas";
import { MovieBuffStaticFallback } from "./MovieBuffStaticFallback";

type RuntimeStatus = "idle" | "loading" | "ready" | "failed";

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
 * Availability is never inferred from HTTP status. The surface is considered
 * connected only after the real Rive loader reports successful initialization.
 * Missing assets, parse failure, renderer failure, WebGL context loss, and
 * reduced motion may only change what is painted; they cannot mutate gameplay.
 */
export function MovieBuffRiveSurface({
  assetSource,
  label,
  artboard,
  stateMachines,
  canvasClassName,
  children,
}: MovieBuffRiveSurfaceProps) {
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus>("idle");
  const [failureReason, setFailureReason] =
    useState<MovieBuffRiveFailureReason | null>(null);
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => setReducedMotion(media.matches);
    syncPreference();
    media.addEventListener("change", syncPreference);
    return () => media.removeEventListener("change", syncPreference);
  }, []);

  useEffect(() => {
    const normalizedSource = assetSource.trim();
    setFailureReason(null);

    if (!normalizedSource) {
      setRuntimeStatus("failed");
      setFailureReason("asset_load_error");
      return;
    }

    if (reducedMotion === false) {
      setRuntimeStatus("loading");
    } else {
      setRuntimeStatus("idle");
    }
  }, [assetSource, reducedMotion]);

  const renderStaticFallback = (
    description: string,
    reason: string,
  ) => (
    <MovieBuffStaticFallback title={label} description={description}>
      <div data-movie-buff-static-fallback-reason={reason}>{children}</div>
    </MovieBuffStaticFallback>
  );

  if (reducedMotion === null) {
    return renderStaticFallback(
      "Motion preference is being resolved before any decorative animation is mounted.",
      "motion_preference_pending",
    );
  }

  if (reducedMotion) {
    return renderStaticFallback(
      "Reduced-motion mode is active. The authoritative phase and deadline continue without decorative movement.",
      "reduced_motion",
    );
  }

  if (runtimeStatus === "failed") {
    return renderStaticFallback(
      "The motion asset, parser, or renderer could not initialize. The authoritative server state remains visible in a static presentation.",
      failureReason ?? "renderer_error",
    );
  }

  return (
    <div
      data-rive-source={assetSource}
      data-rive-asset-status={runtimeStatus === "ready" ? "parsed" : "unverified"}
      data-rive-runtime-status={runtimeStatus === "ready" ? "connected" : "loading"}
      aria-label={label}
      aria-busy={runtimeStatus !== "ready"}
      className="relative min-h-64 overflow-hidden rounded-3xl"
    >
      <MovieBuffRiveCanvas
        assetSource={assetSource}
        label={label}
        artboard={artboard}
        stateMachines={stateMachines}
        className={canvasClassName}
        onRuntimeReady={() => setRuntimeStatus("ready")}
        onRuntimeError={(reason) => {
          setFailureReason(reason);
          setRuntimeStatus("failed");
        }}
      />
      <div className="relative z-10">{children}</div>
      {runtimeStatus !== "ready" ? (
        <span className="sr-only" role="status" aria-live="polite">
          Initializing the cinematic visual runtime. Static authoritative content remains available.
        </span>
      ) : null}
    </div>
  );
}
