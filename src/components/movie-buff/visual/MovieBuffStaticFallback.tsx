import type { ReactNode } from "react";

export function MovieBuffStaticFallback({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-950/30 via-zinc-950 to-black p-6 text-white"
    >
      <p className="text-xs font-black uppercase tracking-[0.28em] text-amber-300">
        Static cinematic fallback
      </p>
      <h2 className="mt-3 text-2xl font-black">{title}</h2>
      <p className="mt-3 max-w-2xl leading-7 text-zinc-300">{description}</p>
      {children ? <div className="mt-5">{children}</div> : null}
    </section>
  );
}
