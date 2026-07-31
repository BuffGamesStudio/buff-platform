import Link from "next/link";
import { Bell, ChevronRight, Search } from "lucide-react";

type AdminHeaderProps = {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
};

export default function AdminHeader({
  title,
  description,
  actionHref,
  actionLabel,
}: AdminHeaderProps) {
  return (
    <header className="border-b border-white/10 bg-black/50 px-5 py-5 backdrop-blur-xl sm:px-8">
      <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-center">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-violet-300">
            Buff Games
            <ChevronRight className="h-3.5 w-3.5" />
            Admin
          </div>

          <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
            {title}
          </h1>

          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            {description}
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />

            <input
              type="search"
              placeholder="Search CMS..."
              className="h-11 w-full rounded-xl border border-white/10 bg-white/5 pl-10 pr-4 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-violet-400 sm:w-64"
            />
          </label>

          <button
            type="button"
            aria-label="Notifications"
            className="hidden h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-400 transition hover:border-violet-400/50 hover:text-white sm:flex"
          >
            <Bell className="h-5 w-5" />
          </button>

          {actionHref && actionLabel ? (
            <Link
              href={actionHref}
              className="flex h-11 items-center justify-center rounded-xl bg-violet-500 px-5 text-sm font-black text-white shadow-lg shadow-violet-500/20 transition hover:bg-violet-400"
            >
              {actionLabel}
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}
