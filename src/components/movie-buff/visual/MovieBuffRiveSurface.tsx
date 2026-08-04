"use client";

import { useState, type ReactNode } from "react";

import { MovieBuffStaticFallback } from "./MovieBuffStaticFallback";

export function MovieBuffRiveSurface({
  assetSource,
  label,
  children,
}: {
  assetSource: string;
  label: string;
  children?: ReactNode;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
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
      data-runtime-status="dependency-pending"
      aria-label={label}
      onError={() => setFailed(true)}
      className="relative overflow-hidden rounded-3xl"
    >
      {children}
    </div>
  );
}
