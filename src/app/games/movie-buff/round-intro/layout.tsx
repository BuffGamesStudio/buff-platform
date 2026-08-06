"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import { getMovieBuffVipCanonicalPhaseView } from "@/lib/game/movieBuffVipService";
import { getMovieBuffVipCanonicalNavigationTarget } from "@/lib/game/movieBuffVipPhasePolicy";

export default function MovieBuffRoundIntroLayout({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const roomId = searchParams.get("roomId")?.trim() ?? "";
  const latestVersion = useRef(0);
  const synchronizing = useRef(false);
  const [syncError, setSyncError] = useState("");

  const synchronizeCanonicalPhase = useCallback(async () => {
    if (!roomId || synchronizing.current) return;
    synchronizing.current = true;

    try {
      const phaseView = await getMovieBuffVipCanonicalPhaseView(roomId);
      if (!phaseView) {
        // MOV-17 is not present on an isolated PR #6 checkout. Missing route
        // state means stay on Round Intro; VIP readiness never chooses a route.
        return;
      }

      if (phaseView.phaseVersion < latestVersion.current) {
        return;
      }
      latestVersion.current = phaseView.phaseVersion;
      setSyncError("");

      const target = getMovieBuffVipCanonicalNavigationTarget({
        currentPath: pathname,
        roomId,
        phaseView,
      });
      if (target) {
        router.replace(target);
      }
    } catch (error) {
      if (error instanceof Error && error.message === "SIGN_IN_REQUIRED") {
        router.replace(
          `/sign-in?next=${encodeURIComponent(`${pathname}?roomId=${roomId}`)}`,
        );
        return;
      }

      setSyncError(
        error instanceof Error
          ? error.message
          : "Authoritative match navigation is unavailable.",
      );
    } finally {
      synchronizing.current = false;
    }
  }, [pathname, roomId, router]);

  useEffect(() => {
    if (!roomId) return;
    void synchronizeCanonicalPhase();
    const interval = window.setInterval(
      () => void synchronizeCanonicalPhase(),
      750,
    );
    return () => window.clearInterval(interval);
  }, [roomId, synchronizeCanonicalPhase]);

  return (
    <>
      {children}
      {syncError ? (
        <div
          role="alert"
          className="fixed inset-x-4 bottom-4 z-[90] mx-auto max-w-3xl rounded-2xl border border-amber-500/40 bg-black/95 px-5 py-4 text-sm font-bold text-amber-100 shadow-2xl"
        >
          VIP selection remains locked, but shared navigation is paused until the
          authoritative phase view recovers: {syncError}
        </div>
      ) : null}
    </>
  );
}
