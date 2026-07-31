"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  getCurrentUser,
  signOut,
  subscribeToAuthChanges,
} from "@/lib/auth/auth";

export default function AuthShellActions({
  mobile = false,
}: {
  mobile?: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] =
    useState(false);
  const [anonymous, setAnonymous] =
    useState(false);
  const [signingOut, setSigningOut] =
    useState(false);

  useEffect(() => {
    let active = true;

    void getCurrentUser()
      .then((user) => {
        if (!active) {
          return;
        }

        setAuthenticated(Boolean(user));
        setAnonymous(user?.is_anonymous === true);
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

        setAuthenticated(Boolean(session?.user));
        setAnonymous(
          session?.user?.is_anonymous === true,
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

  if (loading) {
    return (
      <div
        className={
          mobile
            ? "mt-6 rounded-xl border border-zinc-800 px-4 py-3 text-center text-sm font-bold text-zinc-500"
            : "rounded-xl border border-zinc-800 px-4 py-3 text-sm font-bold text-zinc-500"
        }
      >
        Loading account...
      </div>
    );
  }

  if (authenticated && !anonymous) {
    return (
      <div
        className={
          mobile
            ? "mt-6 flex flex-col gap-3"
            : "flex items-center gap-3"
        }
      >
        <Link
          href="/account"
          className="rounded-xl border border-zinc-700 px-5 py-3 font-bold text-zinc-200 transition hover:border-red-500 hover:text-white"
        >
          Enter Buff Games
        </Link>

        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          className="rounded-xl bg-red-600 px-5 py-3 font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
        >
          {signingOut ? "Signing Out..." : "Sign Out"}
        </button>
      </div>
    );
  }

  return (
    <div
      className={
        mobile
          ? "mt-6 flex flex-col gap-3"
          : "flex items-center gap-3"
      }
    >
      {anonymous ? (
        <div className="rounded-xl border border-yellow-700 bg-yellow-500/10 px-4 py-3 text-sm font-bold text-yellow-300">
          Guest session detected
        </div>
      ) : null}

      <Link
        href="/sign-in"
        className="rounded-xl border border-zinc-700 px-5 py-3 font-bold text-zinc-200 transition hover:border-red-500 hover:text-white"
      >
        Sign In
      </Link>

      <Link
        href="/sign-up"
        className="rounded-xl bg-red-600 px-5 py-3 font-bold text-white transition hover:bg-red-700"
      >
        {anonymous ? "Create Real Account" : "Sign Up"}
      </Link>

      {anonymous ? (
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          className="rounded-xl border border-zinc-700 px-5 py-3 font-bold text-zinc-200 transition hover:border-red-500 hover:text-white disabled:cursor-not-allowed disabled:border-zinc-800 disabled:text-zinc-500"
        >
          {signingOut ? "Signing Out..." : "Sign Out"}
        </button>
      ) : null}
    </div>
  );
}
