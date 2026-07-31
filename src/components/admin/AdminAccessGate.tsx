"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { LoaderCircle, ShieldAlert } from "lucide-react";

import {
  adminFetch,
  getApiErrorMessage,
} from "@/lib/admin/adminClient";

type AdminAccessGateProps = {
  children: ReactNode;
};

export default function AdminAccessGate({
  children,
}: AdminAccessGateProps) {
  const [accessState, setAccessState] = useState<
    "checking" | "allowed" | "denied"
  >("checking");
  const [message, setMessage] = useState(
    "Verifying your Movie Buff admin session.",
  );

  useEffect(() => {
    let isActive = true;

    const verifyAccess = async () => {
      try {
        const response = await adminFetch("/api/admin/access", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(
            await getApiErrorMessage(
              response,
              "Admin access could not be verified.",
            ),
          );
        }

        if (!isActive) {
          return;
        }

        setAccessState("allowed");
      } catch (error) {
        if (!isActive) {
          return;
        }

        setMessage(
          error instanceof Error
            ? error.message
            : "Admin access is required.",
        );
        setAccessState("denied");
      }
    };

    void verifyAccess();

    return () => {
      isActive = false;
    };
  }, []);

  if (accessState === "allowed") {
    return <>{children}</>;
  }

  const denied = accessState === "denied";

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-950/90 p-8 text-center shadow-2xl shadow-black/40">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-300">
          {denied ? (
            <ShieldAlert className="h-8 w-8" />
          ) : (
            <LoaderCircle className="h-8 w-8 animate-spin" />
          )}
        </div>

        <h1 className="mt-5 text-2xl font-black text-white">
          {denied
            ? "Admin access required"
            : "Checking access"}
        </h1>

        <p className="mt-3 text-sm leading-6 text-zinc-400">
          {message}
        </p>

        {denied ? (
          <div className="mt-6 flex flex-col gap-3">
            <Link
              href="/games/movie-buff"
              className="inline-flex items-center justify-center rounded-xl bg-violet-500 px-4 py-3 text-sm font-black text-white transition hover:bg-violet-400"
            >
              Return to Movie Buff
            </Link>

            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-xl border border-white/10 px-4 py-3 text-sm font-black text-zinc-300 transition hover:border-white/20 hover:text-white"
            >
              Return to Buff Games
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
