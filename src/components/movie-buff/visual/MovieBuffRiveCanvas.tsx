"use client";

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

export type MovieBuffRiveCanvasProps = {
  assetSource: string;
  label: string;
  artboard?: string;
  stateMachines?: string | string[];
  className?: string;
  onRuntimeError: () => void;
};

/**
 * Presentation-only Rive adapter.
 *
 * This component deliberately exposes no completion, state-change, input,
 * navigation, room, score, or phase callback. MOV-17 remains the sole owner of
 * authoritative gameplay progression; this canvas only paints the state it is
 * given and may report a visual load failure to its fallback parent.
 */
export function MovieBuffRiveCanvas({
  assetSource,
  label,
  artboard,
  stateMachines,
  className = "h-full min-h-64 w-full",
  onRuntimeError,
}: MovieBuffRiveCanvasProps) {
  const { RiveComponent } = useRive(
    {
      src: assetSource,
      artboard,
      stateMachines,
      autoplay: true,
      layout: containedCenterLayout,
      shouldDisableRiveListeners: true,
      onLoadError: onRuntimeError,
    },
    {
      useOffscreenRenderer: true,
    },
  );

  return (
    <RiveComponent
      className={className}
      role="img"
      aria-label={label}
    />
  );
}
