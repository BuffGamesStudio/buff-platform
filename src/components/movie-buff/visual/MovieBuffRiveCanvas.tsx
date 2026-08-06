"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  Alignment,
  Fit,
  Layout,
  useRive,
} from "@rive-app/react-webgl2";

const containedCenterLayout = new Layout({
  fit: Fit.Contain,
  alignment: Alignment.Center,
});

export type MovieBuffRiveFailureReason =
  | "asset_load_error"
  | "webgl_context_lost"
  | "renderer_error";

export type MovieBuffRiveCanvasProps = {
  assetSource: string;
  label: string;
  artboard?: string;
  stateMachines?: string | string[];
  className?: string;
  onRuntimeReady: () => void;
  onRuntimeError: (reason: MovieBuffRiveFailureReason) => void;
};

/**
 * Presentation-only Rive adapter.
 *
 * This component deliberately exposes no completion, state-change, input,
 * navigation, room, score, or phase callback. MOV-17 remains the sole owner of
 * authoritative gameplay progression; this canvas only paints the state it is
 * given and reports visual initialization or renderer failures to its fallback
 * parent.
 */
export function MovieBuffRiveCanvas({
  assetSource,
  label,
  artboard,
  stateMachines,
  className = "h-full min-h-64 w-full",
  onRuntimeReady,
  onRuntimeError,
}: MovieBuffRiveCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const reportContextLoss = useCallback(
    (event: Event) => {
      event.preventDefault();
      onRuntimeError("webgl_context_lost");
    },
    [onRuntimeError],
  );

  const { RiveComponent } = useRive(
    {
      src: assetSource,
      artboard,
      stateMachines,
      autoplay: true,
      layout: containedCenterLayout,
      shouldDisableRiveListeners: true,
      onLoad: () => onRuntimeReady(),
      onLoadError: () => onRuntimeError("asset_load_error"),
    },
    {
      useOffscreenRenderer: true,
    },
  );

  useEffect(() => {
    let animationFrame = 0;
    let canvas: HTMLCanvasElement | null = null;

    const attachContextListener = () => {
      canvas = hostRef.current?.querySelector("canvas") ?? null;
      if (!canvas) {
        animationFrame = window.requestAnimationFrame(attachContextListener);
        return;
      }

      canvas.addEventListener("webglcontextlost", reportContextLoss);
      canvas.addEventListener("contextlost", reportContextLoss);
    };

    attachContextListener();

    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      canvas?.removeEventListener("webglcontextlost", reportContextLoss);
      canvas?.removeEventListener("contextlost", reportContextLoss);
    };
  }, [reportContextLoss]);

  return (
    <div ref={hostRef} data-movie-buff-rive-canvas="true">
      <RiveComponent
        className={className}
        role="img"
        aria-label={label}
      />
    </div>
  );
}
