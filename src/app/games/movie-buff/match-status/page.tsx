export default function MovieBuffMatchStatusPage() {
  return (
    <main className="min-h-screen bg-black px-6 py-16 text-white">
      <section className="mx-auto max-w-2xl rounded-3xl border border-amber-400/25 bg-zinc-950 p-8 text-center shadow-2xl">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-amber-300">
          Authoritative match status
        </p>
        <h1 className="mt-4 text-3xl font-black">
          This shared match is contained at a safe server state.
        </h1>
        <p className="mt-4 leading-7 text-zinc-400">
          The server-owned phase record determines whether the match is blocked or
          abandoned. Browser history, local timers, host controls, and animation
          completion cannot resume or advance gameplay.
        </p>
      </section>
    </main>
  );
}
