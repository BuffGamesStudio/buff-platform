"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import {
  getCurrentUser,
  signOut,
  subscribeToAuthChanges,
} from "@/lib/auth/auth";

type AccountState = {
  email: string | null;
  isAnonymous: boolean;
} | null;

export default function AccountPage() {
  const [account, setAccount] =
    useState<AccountState>(null);
  const [loading, setLoading] =
    useState(true);
  const [signingOut, setSigningOut] =
    useState(false);

  useEffect(() => {
    let active = true;

    void getCurrentUser()
      .then((user) => {
        if (!active) {
          return;
        }

        setAccount(
          user
            ? {
                email: user.email ?? null,
                isAnonymous:
                  user.is_anonymous === true,
              }
            : null,
        );
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    const unsubscribe = subscribeToAuthChanges(
      (_, session) => {
        if (!active) {
          return;
        }

        const user = session?.user ?? null;

        setAccount(
          user
            ? {
                email: user.email ?? null,
                isAnonymous:
                  user.is_anonymous === true,
              }
            : null,
        );
        setLoading(false);
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  async function handleSignOut() {
    if (signingOut) {
      return;
    }

    setSigningOut(true);

    try {
      await signOut();
      window.location.assign("/");
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <Navbar />

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-8">
          <p className="text-sm font-black uppercase tracking-[0.3em] text-red-500">
            Buff Games Account
          </p>

          <h1 className="mt-4 text-4xl font-black">
            Enter Buff Games
          </h1>

          {loading ? (
            <p className="mt-4 text-zinc-400">
              Loading account...
            </p>
          ) : account ? (
            <>
              <p className="mt-4 text-zinc-300">
                Signed in
                {account.email
                  ? ` as ${account.email}.`
                  : "."}
              </p>

              {account.isAnonymous && (
                <p className="mt-3 rounded-2xl border border-yellow-700 bg-yellow-500/10 px-4 py-3 text-sm font-bold text-yellow-300">
                  This is still an anonymous session. To continue with a real Buff Games account, leave guest mode and create or sign in to a full account before launch use.
                </p>
              )}

              <div className="mt-8 flex flex-wrap gap-4">
                <Link
                  href={
                    account.isAnonymous
                      ? "/sign-up?next=%2Faccount"
                      : "/games/movie-buff"
                  }
                  className="rounded-xl bg-red-600 px-6 py-4 font-black text-white transition hover:bg-red-700"
                >
                  {account.isAnonymous
                    ? "Create Real Account"
                    : "Launch Movie Buff"}
                </Link>

                <Link
                  href="/admin"
                  className="rounded-xl border border-zinc-700 px-6 py-4 font-black text-zinc-200 transition hover:border-red-500 hover:text-white"
                >
                  Open Admin
                </Link>

                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="rounded-xl border border-zinc-700 px-6 py-4 font-black text-zinc-200 transition hover:border-red-500 hover:text-white disabled:cursor-not-allowed disabled:border-zinc-800 disabled:text-zinc-500"
                >
                  {signingOut
                    ? "Signing Out..."
                    : "Sign Out"}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-4 text-zinc-300">
                No Buff Games account session is active yet.
              </p>

              <div className="mt-8 flex flex-wrap gap-4">
                <Link
                  href="/sign-in"
                  className="rounded-xl border border-zinc-700 px-6 py-4 font-black text-zinc-200 transition hover:border-red-500 hover:text-white"
                >
                  Sign In
                </Link>

                <Link
                  href="/sign-up"
                  className="rounded-xl bg-red-600 px-6 py-4 font-black text-white transition hover:bg-red-700"
                >
                  Sign Up
                </Link>
              </div>
            </>
          )}
        </div>
      </section>

      <Footer />
    </main>
  );
}
