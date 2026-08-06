export function MovieBuffReconnectVisual({
  message = "Rejoining the current scene…",
}: {
  message?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-2xl border border-zinc-700 bg-zinc-950/95 px-5 py-4 text-center text-zinc-200"
    >
      <p className="text-xs font-black uppercase tracking-[0.24em] text-red-400">
        Reconnecting
      </p>
      <p className="mt-2 font-bold">{message}</p>
      <p className="mt-2 text-sm text-zinc-500">
        The server remains authoritative. Expired transitions will not replay.
      </p>
    </div>
  );
}
