"use client";

import Link from "next/link";
import { Globe, Mail, MessageCircle } from "lucide-react";

export default function Footer() {
  return (
    <footer className="border-t border-zinc-800 bg-zinc-950">
      <div className="mx-auto max-w-7xl px-8 py-16">
        <div className="grid gap-12 md:grid-cols-4">
          <div>
            <h2 className="mb-4 text-3xl font-black text-white">
              Buff Games
            </h2>

            <p className="leading-7 text-zinc-400">
              Play What You Love. The next generation of movie and television
              trivia competitions.
            </p>
          </div>

          <div>
            <h3 className="mb-4 font-bold text-white">
              Games
            </h3>

            <ul className="space-y-3 text-zinc-400">
              <li>
                <Link href="/games/movie-buff">Movie Buff</Link>
              </li>
              <li className="flex items-center gap-2 text-zinc-500">
                <span>Couch Potato</span>
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wider">
                  Soon
                </span>
              </li>
              <li>
                <Link href="/#leaderboards">Leaderboards</Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 font-bold text-white">
              Company
            </h3>

            <ul className="space-y-3 text-zinc-400">
              <li>
                <Link href="/about">About</Link>
              </li>
              <li>
                <Link href="/community">Community</Link>
              </li>
              <li>
                <Link href="/contact">Contact</Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 font-bold text-white">
              Connect
            </h3>

            <div className="flex gap-4">
              <Link
                href="/community"
                className="rounded-xl bg-zinc-900 p-3 transition hover:bg-red-600"
                aria-label="Visit the Buff Games community"
              >
                <Globe size={20} />
              </Link>

              <Link
                href="/contact"
                className="rounded-xl bg-zinc-900 p-3 transition hover:bg-red-600"
                aria-label="Contact Buff Games"
              >
                <Mail size={20} />
              </Link>

              <Link
                href="/community"
                className="rounded-xl bg-zinc-900 p-3 transition hover:bg-red-600"
                aria-label="Open community chat"
              >
                <MessageCircle size={20} />
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-16 border-t border-zinc-800 pt-8 text-center text-zinc-500">
          © {new Date().getFullYear()} Buff Games. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
