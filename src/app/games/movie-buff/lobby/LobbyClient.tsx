"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  ArrowLeft,
  Bot,
  Check,
  Copy,
  Globe2,
  KeyRound,
  Lock,
  Search,
} from "lucide-react";

import {
  DEFAULT_MOVIE_BUFF_ROOM_MAX_PLAYERS,
  DEFAULT_MOVIE_BUFF_PUBLIC_MATCH_MAX_PLAYERS,
  type MovieBuffCategoryOption,
} from "@/lib/db/movieBuff";
import {
  subscribeToAuthChanges,
} from "@/lib/auth/auth";
import {
  getMovieBuffDifficultyLabel,
  movieBuffDifficultyOptions,
  type MovieBuffDifficultyValue,
} from "@/lib/game/movieBuffPresentation";
import type { OpenMovieBuffRoom } from "@/lib/game/gameState";

type MovieBuffLobbyClientProps = {
  initialCategories: MovieBuffCategoryOption[];
  initialCategoryError?: string | null;
};

function hasVerifiedEmail(user: User | null): boolean {
  if (!user) {
    return false;
  }

  return Boolean(user.email_confirmed_at);
}

export default function MovieBuffLobbyClient({
  initialCategories,
  initialCategoryError = null,
}: MovieBuffLobbyClientProps) {
  const router = useRouter();
  const categories = initialCategories;
  const [categoryId, setCategoryId] = useState<
    string | null
  >(initialCategories[0]?.id ?? null);
  const [difficulty, setDifficulty] =
    useState<MovieBuffDifficultyValue>("medium");
  const [roomCode, setRoomCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [authChecking, setAuthChecking] =
    useState(true);
  const categoryError = initialCategoryError ?? "";
  const [actionError, setActionError] = useState("");
  const [currentOpenRoom, setCurrentOpenRoom] =
    useState<OpenMovieBuffRoom | null>(null);
  const [emailVerified, setEmailVerified] = useState(false);

  const privateCode = "BUFF24";

  const selectedCategory = useMemo(
    () =>
      categories.find(
        (item) => item.id === categoryId,
      ) ?? categories[0] ?? null,
    [categories, categoryId],
  );

  const playableClipCount =
    selectedCategory?.playableClipCount ?? 0;
  const roundCount = Math.min(10, playableClipCount);
  const roomCreationDisabled =
    isLoading ||
    selectedCategory === null ||
    playableClipCount === 0;
  const roomActionsBlocked =
    roomCreationDisabled ||
    currentOpenRoom !== null;

  useEffect(() => {
    let isMounted = true;
    let authResolved = false;

    async function resolveAuthenticatedUser(user: User | null) {
      if (!isMounted || authResolved) {
        return;
      }

      authResolved = true;

      if (!user || user.is_anonymous === true) {
        router.replace(
          `/sign-in?next=${encodeURIComponent(
            "/games/movie-buff/lobby",
          )}`,
        );
        return;
      }

      try {
        setEmailVerified(hasVerifiedEmail(user));
        const { findOpenMovieBuffRoom } =
          await import("@/lib/game/gameState");
        const openRoom =
          await findOpenMovieBuffRoom(user.id);

        if (!isMounted) {
          return;
        }

        setCurrentOpenRoom(openRoom);
        setAuthChecking(false);
      } catch {
        if (isMounted) {
          setCurrentOpenRoom(null);
          setAuthChecking(false);
        }
      }
    }

    const unsubscribe = subscribeToAuthChanges(
      (_event, session) => {
        void resolveAuthenticatedUser(
          session?.user ?? null,
        );
      },
    );

    void import("@/lib/auth/auth")
      .then(({ getCurrentUser }) =>
        getCurrentUser(),
      )
      .then((user) => {
        if (user) {
          void resolveAuthenticatedUser(user);
        }
      })
      .catch(() => {});

    const fallbackTimer = window.setTimeout(() => {
      if (authResolved) {
        return;
      }

      void import("@/lib/auth/auth")
        .then(({ getCurrentUser }) =>
          getCurrentUser(),
        )
        .then((user) => {
          void resolveAuthenticatedUser(user);
        })
        .catch(() => {
          if (!isMounted || authResolved) {
            return;
          }

          authResolved = true;
          setCurrentOpenRoom(null);
          setAuthChecking(false);
        });
    }, 1500);

    return () => {
      isMounted = false;
      window.clearTimeout(fallbackTimer);
      unsubscribe();
    };
  }, [router]);

  async function copyCode() {
    await navigator.clipboard.writeText(privateCode);
    setCopied(true);

    setTimeout(() => {
      setCopied(false);
    }, 1500);
  }

  async function requirePlayer() {
    const { getCurrentUser } = await import(
      "@/lib/auth/auth"
    );

    const user = await getCurrentUser();

      if (!user || user.is_anonymous === true) {
        navigateToUrl(
          `/sign-in?next=${encodeURIComponent(
            "/games/movie-buff/lobby",
        )}`,
      );
      return null;
    }

    return user;
  }

  function navigateToRoom(
    roomId: string,
    roomCodeValue: string,
  ) {
    const destination =
      `/games/movie-buff/waiting-room?roomId=${roomId}&code=${roomCodeValue}`;

    if (typeof window !== "undefined") {
      window.location.assign(destination);
      return;
    }

    router.push(destination);
  }

  function navigateToUrl(destination: string) {
    if (typeof window !== "undefined") {
      window.location.assign(destination);
      return;
    }

    router.push(destination);
  }

  async function createAndOpenRoom(
    roomType: "public" | "private",
  ) {
    try {
      setIsLoading(true);
      setActionError("");

      const user = await requirePlayer();

      if (!user) {
        return;
      }

      if (roomType === "private" && !hasVerifiedEmail(user)) {
        throw new Error(
          "Verify your email before creating private Movie Nights.",
        );
      }

      let room: { id: string; room_code: string };

      if (roomType === "private") {
        const { getCurrentSession } = await import(
          "@/lib/auth/auth"
        );
        const session = await getCurrentSession();

        if (!session?.access_token) {
          throw new Error(
            "A valid Buff Games session is required.",
          );
        }

        const response = await fetch(
          "/api/movie-buff/private-room",
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              categoryId: selectedCategory?.id ?? null,
              difficulty,
              totalRounds: roundCount,
              maxPlayers:
                DEFAULT_MOVIE_BUFF_ROOM_MAX_PLAYERS,
            }),
          },
        );

        const payload = (await response
          .json()
          .catch(() => null)) as
          | {
              room?: {
                id: string;
                room_code: string;
              };
              error?: string;
            }
          | null;

        if (!response.ok || !payload?.room) {
          throw new Error(
            payload?.error ??
              "Private Movie Night could not be created.",
          );
        }

        room = payload.room;
      } else {
        const { createRoom } = await import(
          "@/lib/db/movieBuff"
        );
        room = await createRoom({
          hostId: user.id,
          roomType,
          categoryId: selectedCategory?.id ?? null,
          difficulty,
          totalRounds: roundCount,
          maxPlayers:
            DEFAULT_MOVIE_BUFF_ROOM_MAX_PLAYERS,
        });
      }

      navigateToRoom(room.id, room.room_code);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to create the room.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreateRoom() {
    await createAndOpenRoom("private");
  }

  async function handleFindMatch() {
    try {
      setIsLoading(true);
      setActionError("");

      const { findOrCreatePublicRoom } =
        await import("@/lib/db/movieBuff");
      const user = await requirePlayer();

      if (!user) {
        return;
      }

      const room =
        await findOrCreatePublicRoom({
          categoryId: selectedCategory?.id ?? null,
          difficulty,
          totalRounds: roundCount,
          maxPlayers:
            DEFAULT_MOVIE_BUFF_PUBLIC_MATCH_MAX_PLAYERS,
          playerId: user.id,
        });

      navigateToRoom(room.id, room.room_code);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to find a public match."
      );
    } finally {
      setIsLoading(false);
    }
  }


  async function handleLeaveCurrentOpenRoom() {
    if (!currentOpenRoom) {
      return;
    }

    try {
      setIsLoading(true);
      setActionError("");

      const { leaveCurrentRoom } = await import(
        "@/lib/db/movieBuff"
      );

      await leaveCurrentRoom(currentOpenRoom.roomId);
      setCurrentOpenRoom(null);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to leave the current room.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleJoinRoom() {
    try {
      setIsLoading(true);
      setActionError("");

      if (!roomCode.trim()) {
        throw new Error("Enter a room code.");
      }

      const { joinRoom } = await import(
        "@/lib/db/movieBuff"
      );
      const user = await requirePlayer();
      if (!user) {
        return;
      }
      const room = await joinRoom(roomCode, user.id);

      navigateToRoom(room.id, room.room_code);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to join the room.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  const currentRoomHref = useMemo(() => {
    if (!currentOpenRoom) {
      return null;
    }

    if (currentOpenRoom.status === "waiting") {
      const baseHref =
        `/games/movie-buff/waiting-room?roomId=${encodeURIComponent(
          currentOpenRoom.roomId,
        )}`;

      if (!currentOpenRoom.roomCode) {
        return baseHref;
      }

      return `${baseHref}&code=${encodeURIComponent(
        currentOpenRoom.roomCode,
      )}`;
    }

    if (currentOpenRoom.status === "starting") {
      return `/games/movie-buff/round-intro?roomId=${encodeURIComponent(
        currentOpenRoom.roomId,
      )}`;
    }

    return `/games/movie-buff/play?roomId=${encodeURIComponent(
      currentOpenRoom.roomId,
    )}`;
  }, [currentOpenRoom]);

  if (authChecking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <div className="text-center">
          <p className="text-2xl font-black">
            Checking your Buff Games account...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <header className="border-b border-zinc-800 bg-zinc-950/90">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <Link
            href="/games/movie-buff"
            className="flex items-center gap-2 font-bold text-zinc-300 transition hover:text-red-500"
          >
            <ArrowLeft size={20} />
            Movie Buff
          </Link>

          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-red-500">
              Game Lobby
            </p>

            <h1 className="text-2xl font-black">
              Choose How You Want to Play
            </h1>
          </div>

          <div className="hidden w-28 sm:block" />
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-10">
          <div className="rounded-3xl border border-red-700/50 bg-gradient-to-br from-red-950/40 via-zinc-950 to-black p-8">
            <div className="mb-5 flex items-center gap-4">
              <div className="rounded-2xl bg-red-600 p-4">
                <Bot size={34} />
              </div>

              <div>
                <p className="text-sm font-bold uppercase tracking-[0.25em] text-red-400">
                  Buff Says
                </p>

                <h2 className="text-3xl font-black">
                  Welcome to the Movie Buff Lobby
                </h2>
              </div>
            </div>

            <p className="max-w-3xl text-lg leading-8 text-zinc-300">
              Pick a category, choose your difficulty, and enter a public or
              private match. Fast answers earn more points, so stay sharp.
            </p>
          </div>
        </div>

        {currentOpenRoom && currentRoomHref ? (
          <div className="mb-8 rounded-3xl border border-amber-700/50 bg-gradient-to-br from-amber-950/50 via-zinc-950 to-black p-6">
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-amber-400">
              Current Room
            </p>

            <h2 className="mt-2 text-2xl font-black">
              You already have a Movie Buff room open.
            </h2>

            <p className="mt-3 max-w-3xl text-zinc-300">
              Return to your current{" "}
              {currentOpenRoom.status === "waiting"
                ? "waiting room"
                : currentOpenRoom.status === "starting"
                  ? "round intro"
                  : "live match"}{" "}
              or leave it before starting a new one.
            </p>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() =>
                  navigateToUrl(currentRoomHref)
                }
                className="flex items-center justify-center rounded-xl bg-amber-500 px-6 py-4 text-base font-black text-black transition hover:bg-amber-400"
              >
                Return to Current Room
              </button>

              <button
                type="button"
                onClick={handleLeaveCurrentOpenRoom}
                disabled={isLoading}
                className="rounded-xl border border-zinc-700 px-6 py-4 text-base font-black text-zinc-200 transition hover:border-red-500 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isLoading
                  ? "Working..."
                  : currentOpenRoom.status === "waiting"
                    ? "Leave Current Room"
                    : "Leave Current Match"}
              </button>
            </div>
          </div>
        ) : null}

        {actionError ? (
          <div className="mb-8 rounded-2xl border border-red-800 bg-red-950/60 px-5 py-4 text-sm font-semibold text-red-100">
            {actionError}
          </div>
        ) : null}

        {!emailVerified ? (
          <div className="mb-8 rounded-2xl border border-amber-700 bg-amber-500/10 px-5 py-4 text-sm font-semibold text-amber-200">
            Verify your email to unlock restricted launch features: creating
            private Movie Nights, prize or reward claims, VIP purchases or
            redemption, Contestant Row eligibility, and account recovery
            actions.
          </div>
        ) : null}

        <div className="mb-10 grid gap-8 lg:grid-cols-2">
          <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-8">
            <div className="mb-7 flex items-center gap-4">
              <div className="rounded-2xl bg-red-600/15 p-4 text-red-500">
                <Globe2 size={32} />
              </div>

              <div>
                <h2 className="text-3xl font-black">Public Match</h2>
                <p className="text-zinc-400">
                  Find players and start quickly.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleFindMatch}
              disabled={roomActionsBlocked}
              className="flex w-full items-center justify-center gap-3 rounded-xl bg-red-600 px-6 py-4 text-lg font-black transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <Search size={22} />
              {isLoading ? "Working..." : "Find Match"}
            </button>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-8">
            <div className="mb-7 flex items-center gap-4">
              <div className="rounded-2xl bg-blue-600/15 p-4 text-blue-400">
                <Lock size={32} />
              </div>

              <div>
                <h2 className="text-3xl font-black">Private Match</h2>
                <p className="text-zinc-400">
                  Create a room or join friends.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={handleCreateRoom}
                disabled={roomActionsBlocked || !emailVerified}
                className="rounded-xl border border-blue-500 px-6 py-4 text-lg font-black text-blue-400 transition hover:bg-blue-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isLoading ? "Working..." : "Create Room"}
              </button>

              <div className="flex gap-2">
                <input
                  value={roomCode}
                  onChange={(event) =>
                    setRoomCode(
                      event.target.value.toUpperCase(),
                    )
                  }
                  disabled={
                    isLoading ||
                    currentOpenRoom !== null
                  }
                  placeholder="Room code"
                  className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-black px-4 py-4 uppercase outline-none transition focus:border-blue-500"
                />

                <button
                  type="button"
                  onClick={handleJoinRoom}
                  disabled={
                    isLoading ||
                    !roomCode.trim() ||
                    currentOpenRoom !== null
                  }
                  className="rounded-xl bg-blue-600 px-5 font-black transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  Join
                </button>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between rounded-xl border border-zinc-800 bg-black px-4 py-3">
              <div className="flex items-center gap-3">
                <KeyRound size={20} className="text-zinc-500" />

                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                    Example room code
                  </p>

                  <p className="font-black tracking-[0.25em]">
                    {privateCode}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={copyCode}
                className="rounded-lg border border-zinc-700 p-2 transition hover:border-red-500 hover:text-red-500"
                aria-label="Copy room code"
              >
                {copied ? <Check size={20} /> : <Copy size={20} />}
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-8">
            <h2 className="mb-6 text-3xl font-black">Choose Category</h2>

            <div className="grid gap-3 sm:grid-cols-2">
              {categories.length > 0 ? (
                categories.map((item) => (
                  <button
                    key={item.id ?? item.slug}
                    type="button"
                    onClick={() =>
                      setCategoryId(item.id)
                    }
                    className={`rounded-xl border px-5 py-4 text-left font-bold transition ${
                      selectedCategory?.id === item.id
                        ? "border-red-500 bg-red-600 text-white"
                        : "border-zinc-700 bg-black text-zinc-300 hover:border-red-500"
                    }`}
                  >
                    <span>{item.name}</span>
                  </button>
                ))
              ) : (
                <div className="rounded-xl border border-zinc-800 bg-black px-5 py-4 text-zinc-400 sm:col-span-2">
                  {categoryError ||
                    "Loading categories..."}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-8">
            <h2 className="mb-6 text-3xl font-black">Choose Difficulty</h2>

            <div className="space-y-3">
              {movieBuffDifficultyOptions.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setDifficulty(item.value)}
                  className={`flex w-full items-center justify-between rounded-xl border px-5 py-4 font-bold transition ${
                    difficulty === item.value
                      ? "border-red-500 bg-red-600 text-white"
                      : "border-zinc-700 bg-black text-zinc-300 hover:border-red-500"
                  }`}
                >
                  <span>{item.label}</span>

                  {difficulty === item.value && <Check size={20} />}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-10 rounded-3xl border border-zinc-800 bg-zinc-950 p-8">
          <div className="flex flex-col items-center justify-between gap-6 lg:flex-row">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.25em] text-red-500">
                Your Match Setup
              </p>

              <h2 className="mt-2 text-3xl font-black">
                {selectedCategory?.name ??
                  "Pick a category"}{" "}
                · {getMovieBuffDifficultyLabel(difficulty)}
              </h2>

              <p className="mt-2 text-sm text-zinc-400">
                {selectedCategory === null
                  ? categoryError ||
                    "Loading match setup..."
                  : `This room will use ${roundCount} round${
                      roundCount === 1 ? "" : "s"
                    }.`}
              </p>
            </div>

          </div>
        </div>
      </section>
    </main>
  );
}
