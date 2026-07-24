"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X, Trophy, Gamepad2 } from "lucide-react";

export default function Navbar() {
  const [open, setOpen] = useState(false);

  const links = [
    { name: "Home", href: "/" },
    { name: "Games", href: "/games" },
    { name: "Leaderboards", href: "/leaderboards" },
    { name: "Community", href: "/community" },
    { name: "Shop", href: "/shop" },
    { name: "About", href: "/about" },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-800 bg-black/80 backdrop-blur-lg">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">

        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-600 font-black text-white shadow-lg">
            BG
          </div>

          <div>
            <h1 className="text-2xl font-black tracking-wide text-white">
              Buff Games
            </h1>

            <p className="text-xs uppercase tracking-[0.35em] text-red-500">
              Play What You Love
            </p>
          </div>
        </Link>

        <nav className="hidden items-center gap-8 lg:flex">
          {links.map((link) => (
            <Link
              key={link.name}
              href={link.href}
              className="font-semibold text-zinc-300 transition hover:text-red-500"
            >
              {link.name}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-4 lg:flex">
          <button className="rounded-xl border border-zinc-700 px-5 py-2 font-semibold text-white transition hover:border-red-500 hover:text-red-500">
            Sign In
          </button>

          <button className="flex items-center gap-2 rounded-xl bg-red-600 px-6 py-3 font-bold text-white transition hover:bg-red-700">
            <Gamepad2 size={18} />
            Play Now
          </button>
        </div>

        <button
          onClick={() => setOpen(!open)}
          className="text-white lg:hidden"
        >
          {open ? <X size={32} /> : <Menu size={32} />}
        </button>
      </div>

      {open && (
        <div className="border-t border-zinc-800 bg-black lg:hidden">
          <div className="flex flex-col p-6">

            {links.map((link) => (
              <Link
                key={link.name}
                href={link.href}
                onClick={() => setOpen(false)}
                className="py-4 text-lg text-zinc-300 transition hover:text-red-500"
              >
                {link.name}
              </Link>
            ))}

            <button className="mt-6 rounded-xl border border-zinc-700 py-3 font-semibold text-white">
              Sign In
            </button>

            <button className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-red-600 py-4 font-bold text-white">
              <Trophy size={18} />
              Play Now
            </button>

          </div>
        </div>
      )}
    </header>
  );
}