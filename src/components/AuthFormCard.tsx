"use client";

import Link from "next/link";
import { useState } from "react";

import {
  getCurrentUser,
  signInWithEmail,
  signInWithGoogle,
  signOut,
  signUpWithEmail,
} from "@/lib/auth/auth";

export default function AuthFormCard({
  mode,
  nextTarget = "/account",
}: {
  mode: "sign-in" | "sign-up";
  nextTarget?: string;
}) {
  const [displayName, setDisplayName] =
    useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] =
    useState("");
  const [submitting, setSubmitting] =
    useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] =
    useState("");

  const isSignUp = mode === "sign-up";

  async function exitAnonymousSessionIfNeeded() {
    const currentUser = await getCurrentUser();

    if (currentUser?.is_anonymous === true) {
      await signOut();
      return true;
    }

    return false;
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (submitting) {
      return;
    }

    setSubmitting(true);
    setError("");
    setMessage("");

    try {
      if (isSignUp) {
        const exitedAnonymousSession =
          await exitAnonymousSessionIfNeeded();

        await signUpWithEmail(
          email,
          password,
          displayName,
          `${window.location.origin}${nextTarget.startsWith("/") ? nextTarget : `/${nextTarget}`}`,
        );

        setMessage(
          exitedAnonymousSession
            ? "Guest mode has been exited. Finish email verification if prompted, then sign in to continue with your Buff Games account."
            : "Account created. Finish email verification if prompted, then sign in to continue with your Buff Games account.",
        );
        return;
      }

      await exitAnonymousSessionIfNeeded();
      await signInWithEmail(email, password);
      window.location.assign(nextTarget);
    } catch (authError) {
      setError(
        authError instanceof Error
          ? authError.message
          : "Unable to continue.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogleSignIn() {
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setError("");
    setMessage("");

    try {
      const exitedAnonymousSession =
        await exitAnonymousSessionIfNeeded();

      await signInWithGoogle(
        `${window.location.origin}${nextTarget.startsWith("/") ? nextTarget : `/${nextTarget}`}`,
      );

      if (exitedAnonymousSession) {
        setMessage(
          "Guest mode has been exited. Continue with Google to enter a real Buff Games account.",
        );
      }
    } catch (authError) {
      setError(
        authError instanceof Error
          ? authError.message
          : "Unable to continue with Google.",
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-xl rounded-3xl border border-zinc-800 bg-zinc-950 p-8">
      <p className="text-sm font-black uppercase tracking-[0.3em] text-red-500">
        Buff Games Account
      </p>

      <h1 className="mt-4 text-4xl font-black text-white">
        {isSignUp ? "Sign up" : "Sign in"}
      </h1>

      <p className="mt-4 text-zinc-300">
        {isSignUp
          ? "Create your Buff Games account first, then launch Movie Buff from inside your account. If you are in guest mode, this will exit that guest session before account creation."
          : "Sign in to your Buff Games account, then enter Movie Buff from inside your account."}
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-8 space-y-5"
      >
        {isSignUp && (
          <div>
            <label className="mb-2 block text-sm font-bold text-zinc-300">
              Display name
            </label>
            <input
              value={displayName}
              onChange={(event) =>
                setDisplayName(
                  event.target.value,
                )
              }
              placeholder="Your name"
              className="w-full rounded-xl border border-zinc-700 bg-black px-4 py-4 text-white outline-none transition placeholder:text-zinc-600 focus:border-red-500"
            />
          </div>
        )}

        <div>
          <label className="mb-2 block text-sm font-bold text-zinc-300">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(event) =>
              setEmail(event.target.value)
            }
            placeholder="you@example.com"
            required
            className="w-full rounded-xl border border-zinc-700 bg-black px-4 py-4 text-white outline-none transition placeholder:text-zinc-600 focus:border-red-500"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-bold text-zinc-300">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(event) =>
              setPassword(
                event.target.value,
              )
            }
            placeholder="Password"
            required
            className="w-full rounded-xl border border-zinc-700 bg-black px-4 py-4 text-white outline-none transition placeholder:text-zinc-600 focus:border-red-500"
          />
        </div>

        {error && (
          <div className="rounded-2xl border border-red-700 bg-red-950/40 px-4 py-3 text-sm font-bold text-red-300">
            {error}
          </div>
        )}

        {message && (
          <div className="rounded-2xl border border-emerald-700 bg-emerald-950/30 px-4 py-3 text-sm font-bold text-emerald-300">
            {message}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-red-600 px-6 py-4 text-lg font-black text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
        >
          {submitting
            ? "Working..."
            : isSignUp
              ? "Create Buff Games Account"
              : "Enter Buff Games"}
        </button>
      </form>

      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={submitting}
        className="mt-4 w-full rounded-xl border border-zinc-700 px-6 py-4 text-lg font-black text-zinc-100 transition hover:border-red-500 hover:text-white disabled:cursor-not-allowed disabled:border-zinc-800 disabled:text-zinc-500"
      >
        Continue with Google
      </button>

      <div className="mt-6 text-sm text-zinc-400">
        {isSignUp ? (
          <>
            Already have an account?{" "}
            <Link
              href={`/sign-in?next=${encodeURIComponent(
                nextTarget,
              )}`}
              className="font-bold text-red-400 hover:text-red-300"
            >
              Sign in
            </Link>
          </>
        ) : (
          <>
            Need an account?{" "}
            <Link
              href={`/sign-up?next=${encodeURIComponent(
                nextTarget,
              )}`}
              className="font-bold text-red-400 hover:text-red-300"
            >
              Sign up
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
