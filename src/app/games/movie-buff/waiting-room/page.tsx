"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Bot,
  Check,
  Clock3,
  Copy,
  Crown,
  Film,
  Gamepad2,
  Lock,
  LogOut,
  Users,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import {
  DEFAULT_MOVIE_BUFF_ROOM_MAX_PLAYERS,
  getLobby,
  listPublicMovieBuffCategories,
  leaveCurrentRoom,
  setPlayerReady,
  startRoom,
  subscribeToLobby,
  touchMovieBuffRoomPresence,
  unsubscribeFromLobby,
  type GameRoom,
  type RoomPlayer,
} from "@/lib/db/movieBuff";
import { getMovieBuffDifficultyLabel } from "@/lib/game/movieBuffPresentation";

const PUBLIC_MATCH_SIZE = 3;

function getPlayerName(player: RoomPlayer): string {
  return (
    player.profiles?.display_name?.trim() ||
    player.profiles?.username?.trim() ||
    `Player ${player.player_id.slice(0, 6)}`
  );
}

export default function WaitingRoomPage() {
  const router = useRouter();
  const [roomId, setRoomId] = useState("");
  const [urlRoomCode, setUrlRoomCode] = useState("");
  const [currentPlayerId, setCurrentPlayerId] = useState("");
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [players, setPlayers] = useState<RoomPlayer[]>([]);
  const [categoryNamesById, setCategoryNamesById] =
    useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  const navigateTo = useCallback(
    (destination: string) => {
      if (typeof window !== "undefined") {
        window.location.assign(destination);
        return;
      }
      router.push(destination);
    },
    [router],
  );

  useEffect(() => {
    const parameterTimer = window.setTimeout(() => {
      const parameters = new URLSearchParams(window.location.search);
      setRoomId(parameters.get("roomId") ?? "");
      setUrlRoomCode(parameters.get("code") ?? "");
    }, 0);
    return () => window.clearTimeout(parameterTimer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function ensureCurrentPlayer() {
      try {
        const [
          {
            data: { user },
            error: userError,
          },
          {
            data: { session },
            error: sessionError,
          },
        ] = await Promise.all([
          supabase.auth.getUser(),
          supabase.auth.getSession(),
        ]);

        if (userError) throw userError;
        if (sessionError) throw sessionError;
        const resolvedUser = user ?? session?.user ?? null;
        if (cancelled) return;

        if (!resolvedUser) {
          navigateTo(
            `/sign-in?next=${encodeURIComponent(
              `/games/movie-buff/waiting-room${window.location.search}`,
            )}`,
          );
          return;
        }

        setCurrentPlayerId(resolvedUser.id);
        setError("");
      } catch (authError) {
        if (cancelled) return;
        setCurrentPlayerId("");
        setError(
          authError instanceof Error
            ? authError.message
            : "Unable to restore your player session.",
        );
      }
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) setCurrentPlayerId(session?.user?.id ?? "");
    });

    void ensureCurrentPlayer();
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [navigateTo]);

  const loadLobby = useCallback(async () => {
    if (!roomId) return;

    try {
      if (currentPlayerId) {
        try {
          await touchMovieBuffRoomPresence(roomId);
        } catch {}
      }

      const lobby = await getLobby(roomId);
      setRoom(lobby.room);
      setPlayers(lobby.players);
      setError("");

      if (
        lobby.room.status === "active" ||
        lobby.room.status === "starting"
      ) {
        router.replace(
          `/games/movie-buff/round-intro?roomId=${encodeURIComponent(lobby.room.id)}`,
        );
      } else if (lobby.room.status === "cancelled") {
        router.replace("/games/movie-buff/lobby");
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load the waiting room.",
      );
    } finally {
      setLoading(false);
    }
  }, [currentPlayerId, roomId, router]);

  useEffect(() => {
    if (!roomId) return;
    const loadTimer = window.setTimeout(() => void loadLobby(), 0);
    const refreshInterval = window.setInterval(() => void loadLobby(), 2000);
    const channel = subscribeToLobby(roomId, () => void loadLobby());

    return () => {
      window.clearTimeout(loadTimer);
      window.clearInterval(refreshInterval);
      void unsubscribeFromLobby(channel);
    };
  }, [loadLobby, roomId]);

  useEffect(() => {
    const categoryId = room?.category_id ?? null;
    if (typeof categoryId !== "string" || categoryId.trim().length === 0) return;
    if (room?.category_name?.trim() || categoryNamesById[categoryId]) return;

    let cancelled = false;
    async function resolveCategoryName() {
      try {
        const categories = await listPublicMovieBuffCategories();
        const matchingCategory = categories.find(
          (category) => category.id === categoryId,
        );
        if (!cancelled) {
          setCategoryNamesById((currentNames) => ({
            ...currentNames,
            [categoryId]: matchingCategory?.name?.trim() || "",
          }));
        }
      } catch {}
    }

    void resolveCategoryName();
    return () => {
      cancelled = true;
    };
  }, [categoryNamesById, room?.category_id, room?.category_name]);

  const currentPlayer = useMemo(
    () =>
      players.find((player) => player.player_id === currentPlayerId) ?? null,
    [currentPlayerId, players],
  );

  const roomCode = room?.room_code ?? urlRoomCode ?? "------";
  const displayedCategoryName =
    room?.category_name?.trim() ||
    (room?.category_id
      ? categoryNamesById[room.category_id] || "Selected Category"
      : "All Movies");
  const currentPlayerReady = currentPlayer?.is_ready ?? false;
  const isCurrentPlayerHost = currentPlayer?.is_host ?? false;
  const isPublicRoom = room?.room_type === "public";
  const publicRosterComplete = isPublicRoom && players.length === PUBLIC_MATCH_SIZE;
  const allPlayersReady =
    players.length > 0 && players.every((player) => player.is_ready);
  const canToggleReady = room?.status === "waiting";
  const canPrivateStart =
    !isPublicRoom &&
    isCurrentPlayerHost &&
    players.length > 0 &&
    allPlayersReady &&
    room?.status === "waiting";
  const openSlots = Math.max(
    (isPublicRoom
      ? PUBLIC_MATCH_SIZE
      : room?.max_players ?? DEFAULT_MOVIE_BUFF_ROOM_MAX_PLAYERS) - players.length,
    0,
  );

  const publicStatusMessage = !publicRosterComplete
    ? `Waiting for exactly ${PUBLIC_MATCH_SIZE} players. ${players.length} joined.`
    : !allPlayersReady
      ? "The 3-player room is full. The server waits for all 3 ready signals."
      : "All 3 players are ready. The server is starting the match automatically.";

  async function copyRoomCode() {
    await navigator.clipboard.writeText(roomCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  async function toggleReady() {
    if (!roomId || !currentPlayerId || working || !canToggleReady) return;
    setWorking(true);
    setError("");
    try {
      await setPlayerReady(roomId, currentPlayerId, !currentPlayerReady);
      await loadLobby();
    } catch (readyError) {
      setError(
        readyError instanceof Error
          ? readyError.message
          : "Unable to update your ready status.",
      );
    } finally {
      setWorking(false);
    }
  }

  const handlePrivateStartMatch = useCallback(async () => {
    if (!roomId || !currentPlayerId || !canPrivateStart || working) return;
    setWorking(true);
    setError("");
    try {
      await startRoom(roomId, currentPlayerId);
      navigateTo(
        `/games/movie-buff/round-intro?roomId=${encodeURIComponent(roomId)}`,
      );
    } catch (startError) {
      setError(
        startError instanceof Error
          ? startError.message
          : "Unable to start the match.",
      );
    } finally {
      setWorking(false);
    }
  }, [canPrivateStart, currentPlayerId, navigateTo, roomId, working]);

  async function handleLeaveRoom() {
    if (working) return;
    const resolvedRoomId =
      roomId ||
      new URLSearchParams(window.location.search).get("roomId") ||
      "";
    if (!resolvedRoomId) {
      navigateTo("/games/movie-buff/lobby");
      return;
    }

    setWorking(true);
    setError("");
    try {
      await leaveCurrentRoom(resolvedRoomId);
      navigateTo("/games/movie-buff/lobby");
    } catch (leaveError) {
      setError(
        leaveError instanceof Error
          ? leaveError.message
          : "Unable to leave the room.",
      );
    } finally {
      setWorking(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <div className="text-center">
          <Bot size={48} className="mx-auto mb-4 animate-pulse text-red-500" />
          <p className="text-xl font-black">Loading waiting room...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <header className="border-b border-zinc-800 bg-zinc-950/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <button
            type="button"
            onClick={handleLeaveRoom}
            disabled={working}
            className="flex items-center gap-2 font-bold text-zinc-300 transition hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ArrowLeft size={20} /> Back to Lobby
          </button>
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-red-500">
              {isPublicRoom ? "Public Match" : "Private Match"}
            </p>
            <h1 className="text-2xl font-black">Waiting Room</h1>
          </div>
          <button
            type="button"
            onClick={handleLeaveRoom}
            disabled={working}
            className="flex items-center gap-2 font-bold text-zinc-400 transition hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <LogOut size={20} />
            <span className="hidden sm:inline">Leave</span>
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-12">
        {error ? (
          <div className="mb-6 rounded-2xl border border-red-700 bg-red-950/40 px-5 py-4 font-bold text-red-300">
            {error}
          </div>
        ) : null}

        <div className="mb-8 grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="rounded-3xl border border-red-700/50 bg-gradient-to-br from-red-950/40 via-zinc-950 to-black p-8">
            <div className="mb-5 flex items-center gap-4">
              <div className="rounded-2xl bg-red-600 p-4">
                <Bot size={34} />
              </div>
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.25em] text-red-400">
                  Buff Says
                </p>
                <h2 className="text-3xl font-black">Get Ready, Movie Buffs</h2>
              </div>
            </div>
            <p className="max-w-3xl text-lg leading-8 text-zinc-300">
              {isPublicRoom
                ? "Public matches use one server-owned room of exactly 3 players. There is no host start button or browser auto-start timer."
                : "The match begins when every player is ready and the host starts it."}{" "}
              You will have limited time to identify each movie, so answer quickly.
            </p>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-8">
            <div className="mb-4 flex items-center gap-3">
              <Lock className="text-red-500" />
              <h2 className="text-xl font-black">Room Code</h2>
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-black px-5 py-4">
              <span className="overflow-hidden text-3xl font-black tracking-[0.2em]">
                {roomCode}
              </span>
              <button
                type="button"
                onClick={copyRoomCode}
                className="rounded-xl border border-zinc-700 p-3 transition hover:border-red-500 hover:text-red-500"
                aria-label="Copy room code"
              >
                {copied ? <Check size={22} /> : <Copy size={22} />}
              </button>
            </div>
            <p className="mt-4 text-sm text-zinc-500">Share this code with friends.</p>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
          <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-8">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.25em] text-red-500">
                  Players
                </p>
                <h2 className="mt-2 text-3xl font-black">
                  {players.length} of{" "}
                  {isPublicRoom
                    ? PUBLIC_MATCH_SIZE
                    : room?.max_players ?? DEFAULT_MOVIE_BUFF_ROOM_MAX_PLAYERS}{" "}
                  Joined
                </h2>
              </div>
              <div className="rounded-2xl bg-red-600/15 p-4 text-red-500">
                <Users size={30} />
              </div>
            </div>

            <div className="space-y-4">
              {players.map((player) => {
                const name = getPlayerName(player);
                const isCurrentPlayer = player.player_id === currentPlayerId;
                return (
                  <div
                    key={player.player_id}
                    className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-black p-5"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-900 font-black text-red-500">
                        {name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-black text-white">
                            {name}{isCurrentPlayer ? " (You)" : ""}
                          </h3>
                          {player.is_host ? (
                            <Crown size={18} className="text-yellow-400" />
                          ) : null}
                        </div>
                        <p className="text-sm text-zinc-500">
                          {player.is_host
                            ? "Host"
                            : player.is_ready
                              ? "Ready"
                              : "Waiting"}
                        </p>
                      </div>
                    </div>
                    <div
                      className={`rounded-full px-4 py-2 text-sm font-bold ${
                        player.is_ready
                          ? "bg-green-500/15 text-green-400"
                          : "bg-zinc-800 text-zinc-500"
                      }`}
                    >
                      {player.is_ready ? "Ready" : "Waiting"}
                    </div>
                  </div>
                );
              })}

              {Array.from({ length: openSlots }).map((_, index) => (
                <div
                  key={`open-slot-${index}`}
                  className="flex items-center justify-between rounded-2xl border border-dashed border-zinc-800 bg-black/50 p-5"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-900 font-black text-zinc-600">
                      ?
                    </div>
                    <div>
                      <h3 className="font-black text-zinc-500">Waiting for player...</h3>
                      <p className="text-sm text-zinc-600">Open Slot</p>
                    </div>
                  </div>
                  <div className="rounded-full bg-zinc-800 px-4 py-2 text-sm font-bold text-zinc-500">
                    Waiting
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-8">
              <p className="text-sm font-bold uppercase tracking-[0.25em] text-red-500">
                Match Settings
              </p>
              <div className="mt-6 space-y-5">
                <div className="flex items-center gap-4">
                  <Film className="text-red-500" />
                  <div>
                    <p className="text-sm text-zinc-500">Category</p>
                    <p className="font-black">{displayedCategoryName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Gamepad2 className="text-red-500" />
                  <div>
                    <p className="text-sm text-zinc-500">Difficulty</p>
                    <p className="font-black">
                      {room ? getMovieBuffDifficultyLabel(room.difficulty) : "Fanatic"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Clock3 className="text-red-500" />
                  <div>
                    <p className="text-sm text-zinc-500">Rounds</p>
                    <p className="font-black">{room?.total_rounds ?? 10} Rounds</p>
                  </div>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={toggleReady}
              disabled={!currentPlayer || working || !canToggleReady}
              className={`flex w-full items-center justify-center gap-3 rounded-xl px-8 py-5 text-xl font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${
                currentPlayerReady
                  ? "bg-green-600 hover:bg-green-700"
                  : "bg-red-600 hover:bg-red-700"
              }`}
            >
              {currentPlayerReady ? <Check size={24} /> : <Gamepad2 size={24} />}
              {working
                ? "Updating..."
                : currentPlayerReady
                  ? "Ready!"
                  : "I'm Ready"}
            </button>

            {isPublicRoom ? (
              <div
                className={`w-full rounded-xl border px-6 py-5 text-center font-black ${
                  publicRosterComplete
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-100"
                    : "border-zinc-700 bg-zinc-950 text-zinc-300"
                }`}
              >
                {publicStatusMessage}
              </div>
            ) : isCurrentPlayerHost ? (
              <button
                type="button"
                onClick={() => void handlePrivateStartMatch()}
                disabled={!canPrivateStart || working}
                className="block w-full rounded-xl border border-red-500 px-8 py-5 text-center text-xl font-black text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:border-zinc-700 disabled:text-zinc-500 disabled:hover:bg-transparent"
              >
                {working ? "Starting..." : "Start Match"}
              </button>
            ) : (
              <div className="block w-full rounded-xl border border-zinc-700 px-8 py-5 text-center text-xl font-black text-zinc-500">
                Waiting for Host
              </div>
            )}

            {!allPlayersReady && !isPublicRoom ? (
              <p className="text-center text-sm text-zinc-500">
                Every player must be ready before the host can start the match.
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
