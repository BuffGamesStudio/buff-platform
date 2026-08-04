"use client";

import { useEffect, useState, type ReactNode } from "react";

import { MovieBuffStaticFallback } from "./MovieBuffStaticFallback";

type AssetStatus = "checking" | "ready" | "failed";

export function MovieBuffRiveSurface({
  assetSource,
  label,
  runtimeContent,
  children,
}: {
  assetSource: string;
  label: string;
  runtimeContent?: ReactNode;
  children?: ReactNode;
}) {
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

    if (!assetSource.trim()) {
      setAssetStatus("failed");
      return () => controller.abort();
    }

    setAssetStatus("checking");
    void fetch(assetSource, {
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
        description="The motion asset could not load. Gameplay continues from authoritative server state."
      >
        {children}
      </MovieBuffStaticFallback>
    );
  }

  return (
    <div
      data-rive-source={assetSource}
      data-rive-asset-status={assetStatus}
      data-rive-runtime-status={runtimeContent ? "connected" : "adapter-pending"}
      aria-label={label}
      aria-busy={assetStatus === "checking"}
      className="relative overflow-hidden rounded-3xl"
    >
      {runtimeContent}
      {children}
      {assetStatus === "checking" ? (
        <span className="sr-only" role="status" aria-live="polite">
          Checking cinematic asset availability.
        </span>
      ) : null}
    </div>
  );
}
