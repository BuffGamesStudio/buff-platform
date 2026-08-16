import { supabase } from "@/lib/supabase";

export interface MovieBuffRound {
  matchId: string;
  roundId: string;
  roundNumber: number;
  totalRounds: number;
  timeLimitSeconds: number;
  startedAt: string | null;
  timeLeftSeconds: number;
  clipType: string;
  prompt: string | null;
  quoteText: string | null;
  mediaUrl: string | null;
  playbackStartedAt: string | null;
  hintText: string | null;
  hintUsed: boolean;
  hintPenaltySeconds: number;
}

export interface MovieBuffAnswerResult {
  answerId: string;
  isCorrect: boolean;
  basePoints: number;
  speedBonus: number;
  hintBonus: number;
  streakBonus: number;
  totalPoints: number;
  newScore: number;
  newStreak: number;
  newLives: number;
  correctTitle: string;
}

export interface AdvanceMovieBuffRoundResult {
  status: "active" | "finished";
  roundNumber: number;
  roundId: string | null;
}

export interface MovieBuffStanding {
  playerId: string;
  displayName: string;
  score: number;
  roundPoints: number;
  isCorrect: boolean;
}

export interface MovieBuffRoundResults {
  roomStatus: string;
  isHost: boolean;
  roundId: string;
  roundNumber: number;
  totalRounds: number;
  movieTitle: string;
  releaseYear: number | null;
  director: string | null;
  submittedAnswer: string | null;
  isCorrect: boolean;
  basePoints: number;
  speedBonus: number;
  hintBonus: number;
  streakBonus: number;
  totalPoints: number;
  roundComplete: boolean;
  playersFinished: number;
  playersTotal: number;
  standings: MovieBuffStanding[];
}

export interface MovieBuffFinalStanding {
  playerId: string;
  displayName: string;
  score: number;
  correctAnswers: number;
  answersSubmitted: number;
  accuracy: number;
  currentStreak: number;
  lives: number;
}

export interface MovieBuffFinalResults {
  roomStatus: string;
  playerId: string;
  totalRounds: number;
  completedRounds: number;
  standings: MovieBuffFinalStanding[];
}

type MovieBuffRoundRpcRow = {
  result_match_id: string;
  result_round_id: string;
  result_round_number: number;
  result_total_rounds: number;
  result_time_limit_seconds: number;
  result_started_at: string | null;
  result_time_left_seconds: number;
  result_clip_type: string;
  result_prompt: string | null;
  result_quote_text: string | null;
  result_media_url: string | null;
  result_playback_started_at: string | null;
  result_hint_text: string | null;
  result_hint_used: boolean | null;
  result_hint_penalty_seconds: number | null;
};

export function isCacheableMovieBuffMediaUrl(
  value: string | null | undefined,
) {
  const trimmed = String(value ?? "").trim();

  if (!trimmed) {
    return false;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return true;
  }

  return (
    trimmed.startsWith("/media/movie-buff/") &&
    !trimmed.includes("..") &&
    !/%2e/i.test(trimmed)
  );
}

function resolveRoundMediaUrl(row: {
  result_clip_type?: string | null;
  result_media_url?: string | null;
  result_round_id?: string | null;
}) {
  const clipType = String(
    row.result_clip_type ?? "",
  ).toLowerCase();
  const roundId = String(
    row.result_round_id ?? "",
  ).trim();
  const storedMediaUrl = String(
    row.result_media_url ?? "",
  ).trim();

  if (
    (clipType === "video" || clipType === "audio") &&
    isCacheableMovieBuffMediaUrl(storedMediaUrl)
  ) {
    return storedMediaUrl;
  }

  if (
    (clipType === "video" || clipType === "audio") &&
    roundId.length > 0
  ) {
    return `/api/movie-buff/round-media/${roundId}`;
  }

  return storedMediaUrl;
}

function mapMovieBuffRoundRow(
  row: MovieBuffRoundRpcRow,
): MovieBuffRound {
  return {
    matchId: row.result_match_id,
    roundId: row.result_round_id,
    roundNumber: row.result_round_number,
    totalRounds: row.result_total_rounds,
    timeLimitSeconds:
      row.result_time_limit_seconds,
    startedAt: row.result_started_at,
    timeLeftSeconds:
      row.result_time_left_seconds,
    clipType: row.result_clip_type,
    prompt: row.result_prompt,
    quoteText: row.result_quote_text,
    mediaUrl: resolveRoundMediaUrl(row),
    playbackStartedAt:
      row.result_playback_started_at,
    hintText: row.result_hint_text,
    hintUsed:
      row.result_hint_used === true,
    hintPenaltySeconds:
      row.result_hint_penalty_seconds ??
      0,
  };
}

export async function getCurrentMovieBuffRound(
  roomId: string
): Promise<MovieBuffRound> {
  const { data, error } = await supabase.rpc(
    "get_movie_buff_round",
    {
      p_room_id: roomId,
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  const row = data?.[0];

  if (!row) {
    throw new Error(
      "The current round is unavailable."
    );
  }

  return mapMovieBuffRoundRow(row);
}

export async function enterMovieBuffRound(
  roomId: string
): Promise<MovieBuffRound> {
  const { data, error } = await supabase.rpc(
    "enter_movie_buff_round",
    {
      p_room_id: roomId,
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  const row = data?.[0];

  if (!row) {
    throw new Error(
      "The round could not be entered."
    );
  }

  return mapMovieBuffRoundRow(row);
}

export async function markMovieBuffRoundMediaReady(
  roomId: string
): Promise<MovieBuffRound> {
  const { data, error } = await supabase.rpc(
    "mark_movie_buff_round_media_ready",
    {
      p_room_id: roomId,
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  const row = data?.[0];

  if (!row) {
    throw new Error(
      "The round could not be marked as media-ready."
    );
  }

  return mapMovieBuffRoundRow(row);
}

export async function prepareMovieBuffRoundPlayback(
  roomId: string
): Promise<MovieBuffRound> {
  const { data, error } = await supabase.rpc(
    "prepare_movie_buff_round_playback",
    {
      p_room_id: roomId,
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  const row = data?.[0];

  if (!row) {
    throw new Error(
      "The playback request could not be prepared."
    );
  }

  return mapMovieBuffRoundRow(row);
}

export async function startMovieBuffRoundPlayback(
  roomId: string
): Promise<MovieBuffRound> {
  const { data, error } = await supabase.rpc(
    "start_movie_buff_round_playback",
    {
      p_room_id: roomId,
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  const row = data?.[0];

  if (!row) {
    throw new Error(
      "The playback state could not be updated."
    );
  }

  return mapMovieBuffRoundRow(row);
}

export async function requestMovieBuffRoundHint(
  roomId: string,
  penaltySeconds = 5
): Promise<MovieBuffRound> {
  const { data, error } = await supabase.rpc(
    "use_movie_buff_round_hint",
    {
      p_room_id: roomId,
      p_penalty_seconds: penaltySeconds,
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  const row = data?.[0];

  if (!row) {
    throw new Error(
      "The hint state could not be updated."
    );
  }

  return mapMovieBuffRoundRow(row);
}

export async function submitMovieBuffAnswer(
  roomId: string,
  submittedAnswer: string
): Promise<MovieBuffAnswerResult> {
  const { data, error } = await supabase.rpc(
    "submit_movie_buff_answer",
    {
      p_room_id: roomId,
      p_submitted_answer: submittedAnswer,
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  const row = data?.[0];

  if (!row) {
    throw new Error(
      "No answer result was returned."
    );
  }

  return {
    answerId: row.result_answer_id,
    isCorrect: row.result_is_correct,
    basePoints: row.result_base_points,
    speedBonus: row.result_speed_bonus,
    hintBonus: row.result_hint_bonus ?? 0,
    streakBonus: row.result_streak_bonus,
    totalPoints: row.result_total_points,
    newScore: row.result_new_score,
    newStreak: row.result_new_streak,
    newLives: row.result_new_lives,
    correctTitle: row.result_correct_title,
  };
}

export async function advanceMovieBuffRound(
  roomId: string
): Promise<AdvanceMovieBuffRoundResult> {
  const { data, error } = await supabase.rpc(
    "advance_movie_buff_round",
    {
      p_room_id: roomId,
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  const row = data?.[0];

  if (!row) {
    throw new Error(
      "No round result was returned."
    );
  }

  return {
    status: row.result_status,
    roundNumber: row.result_round_number,
    roundId: row.result_round_id,
  };
}

export async function getMovieBuffRoundResults(
  roomId: string,
  roundId: string
): Promise<MovieBuffRoundResults> {
  const { data, error } = await supabase.rpc(
    "get_movie_buff_round_results",
    {
      p_room_id: roomId,
      p_round_id: roundId,
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  const row = data?.[0];

  if (!row) {
    throw new Error(
      "Round results are unavailable."
    );
  }

  return {
    roomStatus: row.result_room_status,
    isHost: row.result_is_host,
    roundId: row.result_round_id,
    roundNumber: row.result_round_number,
    totalRounds: row.result_total_rounds,
    movieTitle: row.result_movie_title,
    releaseYear: row.result_release_year,
    director: row.result_director,
    submittedAnswer:
      row.result_submitted_answer,
    isCorrect: row.result_is_correct,
    basePoints: row.result_base_points,
    speedBonus: row.result_speed_bonus,
    hintBonus: row.result_hint_bonus ?? 0,
    streakBonus: row.result_streak_bonus,
    totalPoints: row.result_total_points,
    roundComplete:
      row.result_round_complete === true,
    playersFinished:
      row.result_players_finished ?? 0,
    playersTotal:
      row.result_players_total ?? 0,
    standings: (
      row.result_standings ?? []
    ).map(
      (standing: {
        player_id: string;
        display_name: string;
        score: number;
        round_points: number;
        is_correct: boolean;
      }) => ({
        playerId: standing.player_id,
        displayName:
          standing.display_name,
        score: standing.score,
        roundPoints:
          standing.round_points,
        isCorrect:
          standing.is_correct,
      })
    ),
  };
}

export async function getMovieBuffFinalResults(
  roomId: string
): Promise<MovieBuffFinalResults> {
  const { data, error } = await supabase.rpc(
    "get_movie_buff_final_results",
    {
      p_room_id: roomId,
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  const row = data?.[0];

  if (!row) {
    throw new Error(
      "Final results are unavailable."
    );
  }

  return {
    roomStatus: row.result_room_status,
    playerId: row.result_player_id,
    totalRounds: row.result_total_rounds,
    completedRounds:
      row.result_completed_rounds,
    standings: (
      row.result_standings ?? []
    ).map(
      (standing: {
        player_id: string;
        display_name: string;
        score: number;
        correct_answers: number;
        answers_submitted: number;
        accuracy: number;
        current_streak: number;
        lives: number;
      }) => ({
        playerId: standing.player_id,
        displayName:
          standing.display_name,
        score: standing.score,
        correctAnswers:
          standing.correct_answers,
        answersSubmitted:
          standing.answers_submitted,
        accuracy: standing.accuracy,
        currentStreak:
          standing.current_streak,
        lives: standing.lives,
      })
    ),
  };
}
