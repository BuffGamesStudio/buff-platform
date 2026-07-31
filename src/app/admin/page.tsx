import Link from "next/link";
import {
  BarChart3,
  Film,
  Settings,
  ShieldCheck,
  ShieldAlert,
  Shuffle,
  WandSparkles,
} from "lucide-react";

import AdminHeader from "@/components/admin/AdminHeader";

const shortcuts = [
  {
    title: "Content Library",
    description:
      "Review movies, clips, categories, and publication status.",
    href: "/admin/movies",
    icon: Film,
  },
  {
    title: "Clip Analytics",
    description:
      "Review difficulty, solve rates, and clip-level scoring signals.",
    href: "/admin/analytics/clips",
    icon: BarChart3,
  },
  {
    title: "Rotation Control",
    description:
      "Manage boost, featured clips, cooldowns, and retirement status.",
    href: "/admin/analytics/rotation",
    icon: Shuffle,
  },
  {
    title: "QA / Content Health",
    description:
      "Find broken playback, weak clips, and obvious giveaway content.",
    href: "/admin/analytics/qa",
    icon: ShieldAlert,
  },
  {
    title: "CMS Settings",
    description:
      "Review admin configuration and future content system controls.",
    href: "/admin/settings",
    icon: Settings,
  },
];

export default function AdminDashboardPage() {
  return (
    <>
      <AdminHeader
        title="Admin Home"
        description="Use the secured Movie Buff admin area to manage the public content library."
        actionHref="/admin/analytics"
        actionLabel="Open Analytics Hub"
      />

      <div className="space-y-8 p-5 sm:p-8">
        <section className="rounded-3xl border border-violet-400/20 bg-gradient-to-br from-violet-950 via-zinc-950 to-black p-6 sm:p-8">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-300/20 bg-violet-400/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-violet-200">
              <ShieldCheck className="h-3.5 w-3.5" />
              Admin locked
            </div>

            <h2 className="mt-5 text-3xl font-black tracking-tight text-white sm:text-4xl">
              Content tools stay in admin, including automatic clip verification and playback wiring.
            </h2>

            <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-300 sm:text-base">
              Use admin for reviewing, editing, publishing, and retiring Movie Buff content. Source-based movie clips can now be verified in admin and generated on demand during playback instead of being permanently rendered ahead of time.
            </p>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          {shortcuts.map((shortcut) => {
            const Icon = shortcut.icon;

            return (
              <Link
                key={shortcut.href}
                href={shortcut.href}
                className="rounded-3xl border border-white/10 bg-zinc-950 p-6 transition hover:border-violet-400/30 hover:bg-zinc-900"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-400/10 text-violet-300">
                  <Icon className="h-6 w-6" />
                </div>

                <h3 className="mt-5 text-xl font-black text-white">
                  {shortcut.title}
                </h3>

                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  {shortcut.description}
                </p>
              </Link>
            );
          })}
        </section>

        <section className="rounded-3xl border border-white/10 bg-zinc-950 p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-400/10 text-amber-300">
              <WandSparkles className="h-6 w-6" />
            </div>

            <div>
              <h3 className="text-lg font-black text-white">
                Content workflow
              </h3>

              <p className="mt-2 text-sm leading-7 text-zinc-400">
                The current workflow is: source research and movie intake, then admin verification, then automatic round-time clip generation with temporary caching. Admin is where you manage the source records that feed that generator.
              </p>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
