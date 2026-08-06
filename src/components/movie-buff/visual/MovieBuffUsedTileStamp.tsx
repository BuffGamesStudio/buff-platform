export function MovieBuffUsedTileStamp({
  label = "Scene Complete",
}: {
  label?: string;
}) {
  return (
    <span className="inline-flex -rotate-3 items-center rounded-md border-2 border-amber-300/80 bg-black/70 px-3 py-1 text-xs font-black uppercase tracking-[0.22em] text-amber-200 shadow-lg">
      {label}
    </span>
  );
}
