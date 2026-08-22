import { supabase } from "@/lib/supabase";

export type MovieBuffLiveContestant = {
  seatIndex: number;
  displayName: string;
  avatarUrl: string | null;
  score: number;
  participantState: string;
};

export type MovieBuffLiveShowView = {
  showKey: string;
  status: string;
  episodeNumber: number;
  roomId: string | null;
  matchId: string | null;
  currentPhase: string | null;
  currentPhaseVersion: number | null;
  currentPhaseEndsAt: string | null;
  currentRoundNumber: number | null;
  totalRounds: number | null;
  queueCount: number;
  queueCapacity: number;
  myQueueStatus: string | null;
  myQueuePosition: number | null;
  contestants: MovieBuffLiveContestant[];
  serverNow: string;
  nextTickAt: string | null;
  lastHeartbeatAt: string | null;
};

export type MovieBuffLiveQueueResult = {
  entryId: string;
  status: string;
  position: number | null;
  cooldownUntil: string | null;
  joinedAt: string;
  serverNow: string;
};

function requireObject<T>(data: unknown, message: string): T {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(message);
  }

  return data as T;
}

export async function getMovieBuffLiveShowView(
  showKey = "main",
): Promise<MovieBuffLiveShowView> {
  const { data, error } = await supabase.rpc(
    "get_movie_buff_live_show_view",
    { p_show_key: showKey },
  );

  if (error) {
    throw new Error(error.message);
  }

  return requireObject<MovieBuffLiveShowView>(
    data,
    "The Movie Buff Live show status is unavailable.",
  );
}

export async function joinMovieBuffLiveQueue(
  showKey = "main",
): Promise<MovieBuffLiveQueueResult> {
  const { data, error } = await supabase.rpc(
    "join_movie_buff_live_queue",
    { p_show_key: showKey },
  );

  if (error) {
    throw new Error(error.message);
  }

  return requireObject<MovieBuffLiveQueueResult>(
    data,
    "The Movie Buff Live queue did not return a result.",
  );
}

export async function heartbeatMovieBuffLiveQueue(
  showKey = "main",
): Promise<void> {
  const { error } = await supabase.rpc(
    "heartbeat_movie_buff_live_queue",
    { p_show_key: showKey },
  );

  if (error) {
    throw new Error(error.message);
  }
}

export async function leaveMovieBuffLiveQueue(
  showKey = "main",
): Promise<void> {
  const { error } = await supabase.rpc(
    "leave_movie_buff_live_queue",
    { p_show_key: showKey },
  );

  if (error) {
    throw new Error(error.message);
  }
}
