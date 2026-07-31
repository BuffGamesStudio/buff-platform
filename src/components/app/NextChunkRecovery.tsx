"use client";

import { useEffect } from "react";

const RECOVERY_STORAGE_KEY =
  "buff-next-chunk-recovery-at";
const RECOVERY_COOLDOWN_MS = 30_000;

function isChunkLoadFailure(
  message: string,
  source = ""
) {
  return (
    /ChunkLoadError/i.test(message) ||
    /Loading chunk [\w-]+ failed/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(
      message
    ) ||
    /CSS_CHUNK_LOAD_FAILED/i.test(message) ||
    /\/_next\/static\/chunks\//i.test(source)
  );
}

function triggerRecovery(reason: string) {
  try {
    const now = Date.now();
    const lastAttempt = Number(
      window.sessionStorage.getItem(
        RECOVERY_STORAGE_KEY
      ) ?? "0"
    );

    if (
      Number.isFinite(lastAttempt) &&
      now - lastAttempt <
        RECOVERY_COOLDOWN_MS
    ) {
      return;
    }

    window.sessionStorage.setItem(
      RECOVERY_STORAGE_KEY,
      String(now)
    );
  } catch {
    // Ignore storage access issues and still try to recover.
  }

  console.warn(
    "[Buff Games] Reloading after stale chunk failure.",
    reason
  );

  window.location.reload();
}

export default function NextChunkRecovery() {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      const message =
        event.message ||
        (event.error instanceof Error
          ? event.error.message
          : "");

      if (
        isChunkLoadFailure(
          message,
          event.filename ?? ""
        )
      ) {
        triggerRecovery(message);
      }
    };

    const handleRejection = (
      event: PromiseRejectionEvent
    ) => {
      const reason = event.reason;

      const message =
        typeof reason === "string"
          ? reason
          : reason instanceof Error
            ? reason.message
            : "";

      const source =
        typeof reason === "object" &&
        reason !== null &&
        "url" in reason &&
        typeof reason.url === "string"
          ? reason.url
          : "";

      if (isChunkLoadFailure(message, source)) {
        triggerRecovery(message || source);
      }
    };

    window.addEventListener(
      "error",
      handleError
    );
    window.addEventListener(
      "unhandledrejection",
      handleRejection
    );

    return () => {
      window.removeEventListener(
        "error",
        handleError
      );
      window.removeEventListener(
        "unhandledrejection",
        handleRejection
      );
    };
  }, []);

  return null;
}
