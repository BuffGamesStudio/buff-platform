"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Clapperboard,
  Film,
  LayoutDashboard,
  LibraryBig,
  ShieldAlert,
  Shuffle,
  Settings,
} from "lucide-react";

const navigation = [
  {
    name: "Dashboard",
    href: "/admin",
    icon: LayoutDashboard,
  },
  {
    name: "Content Library",
    href: "/admin/movies",
    icon: Film,
  },
  {
    name: "Source Registry",
    href: "/admin/sources",
    icon: LibraryBig,
  },
  {
    name: "Clip Analytics",
    href: "/admin/analytics/clips",
    icon: BarChart3,
  },
  {
    name: "Rotation Control",
    href: "/admin/analytics/rotation",
    icon: Shuffle,
  },
  {
    name: "QA Health",
    href: "/admin/analytics/qa",
    icon: ShieldAlert,
  },
  {
    name: "Match Analytics",
    href: "/admin/analytics/matches",
    icon: Clapperboard,
  },
];

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-full flex-col border-b border-white/10 bg-zinc-950 lg:fixed lg:inset-y-0 lg:left-0 lg:min-h-screen lg:w-72 lg:border-b-0 lg:border-r">
      <div className="flex items-center gap-3 border-b border-white/10 px-6 py-6">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/20">
          <Clapperboard className="h-6 w-6 text-white" />
        </div>

        <div>
          <p className="text-lg font-black tracking-tight text-white">
            Movie Buff
          </p>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-300">
            Content CMS
          </p>
        </div>
      </div>

      <nav className="grid gap-1 px-4 py-5 sm:grid-cols-2 lg:block">
        {navigation.map((item) => {
          const Icon = item.icon;
          const active =
            item.href === "/admin"
              ? pathname === item.href
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                active
                  ? "bg-violet-500 text-white shadow-lg shadow-violet-500/20"
                  : "text-zinc-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon className="h-5 w-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-white/10 p-4">
        <Link
          href="/"
          className="flex items-center justify-center rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-zinc-300 transition hover:border-violet-400/50 hover:bg-violet-500/10 hover:text-white"
        >
          Return to Buff Games
        </Link>

        <Link
          href="/admin/settings"
          className="mt-2 flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-zinc-500 transition hover:text-white"
        >
          <Settings className="h-4 w-4" />
          CMS Settings
        </Link>
      </div>
    </aside>
  );
}
