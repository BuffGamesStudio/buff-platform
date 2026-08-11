"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  FormEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  Clock3,
  Film,
  Flame,
  Heart,
  ImageIcon,
  Mic,
  Play,
  Send,
  Star,
  Trophy,
  Volume2,
  XCircle,
} from "lucide-react";

import type {
  GameRoom,
  RoomPlayer,
} from "@/lib/db/movieBuff";
import {
  leaveCurrentRoom,
  touchMovieBuffRoomPresence,
} from "@/lib/db/movieBuff";
import { getCurrentSession } from "@/lib/auth/auth";

import {
  findCurrentRoomId,
  getCurrentUserId,
  getPlayerName,
  loadGameState,
  subscribeToGameState,
  unsubscribeFromGameState,
} from "@/lib/game/gameState";

import {
  enterMovieBuffRound,
  getCurrentMovieBuffRound,
  markMovieBuffRoundMediaReady,
  prepareMovieBuffRoundPlayback,
  requestMovieBuffRoundHint,
  startMovieBuffRoundPlayback,
  submitMovieBuffAnswer,
  type MovieBuffAnswerResult,
  type MovieBuffRound,
} from "@/lib/game/roundService";
import { queueMovieBuffEvent } from "@/lib/game/movieBuffAnalytics";
import {
  advanceMovieBuffMatchPhase,
  buildMovieBuffPhaseRouteHref,
  getMovieBuffMatchPhaseView,
  type MovieBuffMatchPhaseView,
} from "@/lib/game/movieBuffPhaseService";
import { getMovieBuffDifficultyLabel } from "@/lib/game/movieBuffPresentation";
import { getMovieBuffPlayerTier } from "@/lib/game/movieBuffPlayerTier";
import MovieBuffLoadingTicker from "@/components/movie-buff/MovieBuffLoadingTicker";

type MediaElement =
  | HTMLVideoElement
  | HTMLAudioElement;

type MovieBuffSpeechRecognitionError =
  | "aborted"
  | "audio-capture"
  | "language-not-supported"
  | "network"
  | "no-speech"
  | "not-allowed"
  | "service-not-allowed";

interface MovieBuffSpeechRecognitionAlternative {
  confidence: number;
  transcript: string;
}

interface MovieBuffSpeechRecognitionResult {
  [index: number]: MovieBuffSpeechRecognitionAlternative;
  isFinal: boolean;
  length: number;
}

interface MovieBuffSpeechRecognitionResultList {
  [index: number]: MovieBuffSpeechRecognitionResult;
  length: number;
}

interface MovieBuffSpeechRecognitionEvent
  extends Event {
  resultIndex: number;
  results: MovieBuffSpeechRecognitionResultList;
}

interface MovieBuffSpeechRecognitionErrorEvent
  extends Event {
  error: MovieBuffSpeechRecognitionError;
  message?: string;
}

interface MovieBuffSpeechRecognition
  extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onend: ((event: Event) => void) | null;
  onerror:
    | ((
        event: MovieBuffSpeechRecognitionErrorEvent
      ) => void)
    | null;
  onresult:
    | ((
        event: MovieBuffSpeechRecognitionEvent
      ) => void)
    | null;
  onstart: ((event: Event) => void) | null;
  abort: () => void;
  start: () => void;
  stop: () => void;
}

type MovieBuffSpeechRecognitionConstructor =
  new () => MovieBuffSpeechRecognition;

type MovieBuffSpeechWindow = Window & {
  SpeechRecognition?: MovieBuffSpeechRecognitionConstructor;
  webkitSpeechRecognition?: MovieBuffSpeechRecognitionConstructor;
};

type MovieBuffPlaybackRepairPayload = {
  repaired?: boolean;
  roundId?: string | null;
  playbackStartedAt?: string | null;
  error?: string;
};

const CLIP_PLAYBACK_DELAY_MS = 180;
const HINT_TIME_PENALTY_SECONDS = 5;
const PLAY_PAGE_INIT_TIMEOUT_MS = 8_000;

async function withTimeout<T>(
  work: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  let timeoutHandle: number | null = null;

  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timeoutHandle = window.setTimeout(() => {
          reject(new Error(timeoutMessage));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle !== null) {
      window.clearTimeout(timeoutHandle);
    }
  }
}

function getSpeechRecognitionErrorMessage(
  error: MovieBuffSpeechRecognitionError
): string {
  switch (error) {
    case "aborted":
      return "";
    case "audio-capture":
      return "No microphone was found. Check your device audio input and try again.";
    case "language-not-supported":
      return "Speech recognition is not available for this language setting.";
    case "network":
      return "Speech recognition lost its connection. Try the microphone again.";
    case "no-speech":
      return "No speech was heard. Try the microphone again.";
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access was blocked. Allow microphone access and try again.";
    default:
      return "Speech recognition could not continue.";
  }
}

export default function MovieBuffPlayPage() {
  const router = useRouter();

  const redirectStarted = useRef(false);
  const phaseNavigationStartedRef =
    useRef(false);
  const mediaRef =
    useRef<MediaElement | null>(null);
  const speechRecognitionRef = useRef<
    MovieBuffSpeechRecognition | null
  >(null);
  const maximumPlayedTime =
    useRef(0);
  const clipStartTimeoutRef =
    useRef<number | null>(null);
  const mediaReadyRoundRef = useRef<
    string | null
  >(null);
  const clipLoadedRoundRef = useRef<
    string | null
  >(null);
  const playbackPreparedRoundRef = useRef<
    string | null
  >(null);
  const playbackSyncRoundRef = useRef<
    string | null
  >(null);
  const syncRoundStateRef = useRef<
    () => Promise<void>
  >(async () => {});
  const repairPlaybackStateRef = useRef<
    (
      targetRoomId: string
    ) => Promise<MovieBuffPlaybackRepairPayload | null>
  >(async () => null);
  const playbackRepairRoundRef = useRef<
    string | null
  >(null);
  const clipFailedRoundRef = useRef<
    string | null
  >(null);
  const timeoutLoggedRoundRef = useRef<
    string | null
  >(null);
  const activeRoundIdRef = useRef<
    string | null
  >(null);

  const [roomId, setRoomId] =
    useState("");
  const [playerId, setPlayerId] =
    useState("");

  const [room, setRoom] =
    useState<GameRoom | null>(null);
  const [players, setPlayers] =
    useState<RoomPlayer[]>([]);
  const [roundData, setRoundData] =
    useState<MovieBuffRound | null>(null);

  const [timeLeft, setTimeLeft] =
    useState(0);
  const [answer, setAnswer] =
    useState("");
  const [answerResult, setAnswerResult] =
    useState<MovieBuffAnswerResult | null>(
      null
    );

  const [loading, setLoading] =
    useState(true);
  const [submitting, setSubmitting] =
    useState(false);
  const [error, setError] =
    useState("");

  const [mediaReady, setMediaReady] =
    useState(false);
  const [mediaStarted, setMediaStarted] =
    useState(false);
  const [mediaFailed, setMediaFailed] =
    useState(false);
  const [mediaStarting, setMediaStarting] =
    useState(false);
  const [hintPending, setHintPending] =
    useState(false);
  const [speechListening, setSpeechListening] =
    useState(false);
  const [leaving, setLeaving] =
    useState(false);

  useEffect(() => {
    activeRoundIdRef.current =
      roundData?.roundId ?? null;
  }, [roundData?.roundId]);

  const navigateTo = useCallback(
    (destination: string, replace = false) => {
      if (replace) {
        router.replace(destination);
        return;
      }

      router.push(destination);
    },
    [router]
  );

  const navigateToPhaseRoute = useCallback(
    (
      phaseView: MovieBuffMatchPhaseView,
      fallbackRoundId?: string | null
    ) => {
      const destination =
        buildMovieBuffPhaseRouteHref(
          phaseView,
          roomId || undefined
        ) ??
        (phaseView.phaseRoute ===
          "/games/movie-buff/round-results" &&
        roomId &&
        fallbackRoundId
          ? `/games/movie-buff/round-results?roomId=${encodeURIComponent(
              roomId
            )}&roundId=${encodeURIComponent(
              fallbackRoundId
            )}`
          : null);

      if (!destination) {
        console.info(
          "[movie-buff-play] no phase destination",
          {
            roomId,
            phase: phaseView.phase,
            phaseRoute:
              phaseView.phaseRoute,
            fallbackRoundId:
              fallbackRoundId ?? null,
          }
        );
        return false;
      }

      if (
        typeof window !== "undefined" &&
        phaseView.phaseRoute ===
          window.location.pathname
      ) {
        console.info(
          "[movie-buff-play] phase route already active",
          {
            roomId,
            phase: phaseView.phase,
            phaseRoute:
              phaseView.phaseRoute,
            destination,
            pathname:
              window.location.pathname,
          }
        );
        return false;
      }

      if (
        phaseNavigationStartedRef.current
      ) {
        console.info(
          "[movie-buff-play] phase navigation already started",
          {
            roomId,
            phase: phaseView.phase,
            phaseRoute:
              phaseView.phaseRoute,
            destination,
            fallbackRoundId:
              fallbackRoundId ?? null,
          }
        );
        return true;
      }

      console.info(
        "[movie-buff-play] navigating to phase route",
        {
          roomId,
          phase: phaseView.phase,
          phaseRoute:
            phaseView.phaseRoute,
          destination,
          fallbackRoundId:
              fallbackRoundId ?? null,
        }
      );
      phaseNavigationStartedRef.current =
        true;
      navigateTo(destination, true);
      return true;
    },
    [navigateTo, roomId]
  );

  const syncPhaseRoute = useCallback(
    async (options?: {
      advance?: boolean;
      fallbackRoundId?: string | null;
    }) => {
      if (!roomId) {
        return false;
      }

      console.info(
        "[movie-buff-play] syncPhaseRoute start",
        {
          roomId,
          options:
            options ?? null,
          roundId:
            roundData?.roundId ?? null,
          answerResultPresent:
            answerResult !== null,
          timeLeft,
          pathname:
            typeof window !==
            "undefined"
              ? window.location.pathname
              : null,
        }
      );

      try {
        await touchMovieBuffRoomPresence(roomId);
      } catch {}

      let phaseView =
        await getMovieBuffMatchPhaseView(roomId);

      console.info(
        "[movie-buff-play] syncPhaseRoute phase view",
        {
          roomId,
          phase: phaseView.phase,
          phaseRoute:
            phaseView.phaseRoute,
          phaseVersion:
            phaseView.phaseVersion,
          roundId:
            phaseView.roundId,
        }
      );

      if (
        options?.advance &&
        phaseView.phaseRoute ===
          "/games/movie-buff/play"
      ) {
        console.info(
          "[movie-buff-play] syncPhaseRoute advancing phase",
          {
            roomId,
            phaseVersion:
              phaseView.phaseVersion,
            roundId:
              phaseView.roundId,
          }
        );
        await advanceMovieBuffMatchPhase(
          roomId,
          phaseView.phaseVersion
        ).catch(() => null);

        phaseView =
          await getMovieBuffMatchPhaseView(
            roomId
          ).catch(() => phaseView);

        console.info(
          "[movie-buff-play] syncPhaseRoute phase view after advance",
          {
            roomId,
            phase: phaseView.phase,
            phaseRoute:
              phaseView.phaseRoute,
            phaseVersion:
              phaseView.phaseVersion,
            roundId:
              phaseView.roundId,
          }
        );
      }

      if (
        phaseView.phaseRoute ===
        "/games/movie-buff/play"
      ) {
        if (
          phaseView.phase === "answer" &&
          phaseView.answerDeadlineAt
        ) {
          setTimeLeft(
            Math.max(
              0,
              Math.ceil(
                (new Date(
                  phaseView.answerDeadlineAt
                ).getTime() -
                  Date.now()) /
                  1000
              )
            )
          );
        }

        if (
          phaseView.phase === "answer" &&
          phaseView.roundId ===
            roundData?.roundId &&
          !roundData.playbackStartedAt
        ) {
          await repairPlaybackStateRef.current(
            roomId
          )
            .then((payload) => {
              if (
                !payload?.playbackStartedAt
              ) {
                return syncRoundStateRef.current();
              }

              return null;
            })
            .catch(() => null);
        }
      }

      return navigateToPhaseRoute(
        phaseView,
        options?.fallbackRoundId ?? null
      );
    },
    [
      answerResult,
      navigateToPhaseRoute,
      roomId,
      roundData?.playbackStartedAt,
      roundData?.roundId,
      timeLeft,
    ]
  );

  const loadPlayers = useCallback(
    async (
      resolvedRoomId: string,
      resolvedPlayerId: string
    ) => {
      try {
        await touchMovieBuffRoomPresence(
          resolvedRoomId
        );
      } catch {}

      const game = await loadGameState(
        resolvedRoomId,
        resolvedPlayerId
      );

      setRoom(game.room);
      setPlayers(game.players);
    },
    []
  );

  const speechRecognitionAvailable =
    useMemo(() => {
      if (typeof window === "undefined") {
        return false;
      }

      const speechWindow =
        window as MovieBuffSpeechWindow;

      return Boolean(
        speechWindow.SpeechRecognition ??
          speechWindow.webkitSpeechRecognition
      );
    }, []);

  useEffect(() => {
    const speechWindow =
      window as MovieBuffSpeechWindow;
    const SpeechRecognitionConstructor =
      speechWindow.SpeechRecognition ??
      speechWindow.webkitSpeechRecognition;

    if (!SpeechRecognitionConstructor) {
      speechRecognitionRef.current = null;
      return;
    }

    const recognition =
      new SpeechRecognitionConstructor();

    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setSpeechListening(true);
    };

    recognition.onend = () => {
      setSpeechListening(false);
    };

    recognition.onresult = (event) => {
      const transcript = Array.from(
        {
          length:
            event.results.length -
            event.resultIndex,
        },
        (_, index) =>
          event.results[
            event.resultIndex + index
          ]?.[0]?.transcript?.trim() ?? ""
      )
        .filter(Boolean)
        .join(" ")
        .trim();

      if (transcript) {
        setAnswer(transcript);
      }
    };

    recognition.onerror = (event) => {
      setSpeechListening(false);

      const nextError =
        getSpeechRecognitionErrorMessage(
          event.error
        );

      if (nextError) {
        setError(nextError);
      }
    };

    speechRecognitionRef.current =
      recognition;

    return () => {
      recognition.onstart = null;
      recognition.onend = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.abort();
      speechRecognitionRef.current = null;
      setSpeechListening(false);
    };
  }, []);

  useEffect(() => {
    let active = true;
    let channel:
      | ReturnType<
          typeof subscribeToGameState
        >
      | undefined;

    async function initialize() {
      try {
        const params =
          new URLSearchParams(
            window.location.search
          );

        let resolvedRoomId =
          params.get("roomId") ?? "";

        const resolvedPlayerId =
          await getCurrentUserId();

        if (!resolvedRoomId) {
          resolvedRoomId =
            (await findCurrentRoomId(
              resolvedPlayerId
            )) ?? "";
        }

        if (!resolvedRoomId) {
          navigateTo(
            "/games/movie-buff/lobby",
            true
          );
          return;
        }

        await withTimeout(
          loadPlayers(
            resolvedRoomId,
            resolvedPlayerId
          ),
          PLAY_PAGE_INIT_TIMEOUT_MS,
          "Timed out while loading match players."
        );

        let gameRound: MovieBuffRound;

        try {
          gameRound = await withTimeout(
            enterMovieBuffRound(
              resolvedRoomId
            ),
            PLAY_PAGE_INIT_TIMEOUT_MS,
            "Timed out while entering the round."
          );
        } catch (enterRoundError) {
          gameRound = await withTimeout(
            getCurrentMovieBuffRound(
              resolvedRoomId
            ),
            PLAY_PAGE_INIT_TIMEOUT_MS,
            "Timed out while restoring the current round."
          );

          console.warn(
            "[Movie Buff] Falling back to current round state after enter-round failure.",
            enterRoundError
          );
        }

        if (!active) {
          return;
        }

        setRoomId(resolvedRoomId);
        setPlayerId(resolvedPlayerId);
        setRoundData(gameRound);
        setTimeLeft(
          Math.max(
            gameRound.timeLeftSeconds,
            0
          )
        );

        channel = subscribeToGameState(
          resolvedRoomId,
          () => {
            void loadPlayers(
              resolvedRoomId,
              resolvedPlayerId
            );
          }
        );
      } catch (initializeError) {
        if (
          initializeError instanceof Error &&
          initializeError.message ===
            "You must sign in with a Buff Games account to continue."
        ) {
          navigateTo(
            `/sign-in?next=${encodeURIComponent(
              `/games/movie-buff/play${window.location.search}`
            )}`,
            true
          );
          return;
        }

        setError(
          initializeError instanceof Error
            ? initializeError.message
            : "Unable to initialize the round."
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void initialize();

    return () => {
      active = false;

      if (channel) {
        void unsubscribeFromGameState(
          channel
        );
      }
    };
  }, [loadPlayers, navigateTo]);

  useLayoutEffect(() => {
    redirectStarted.current = false;
    maximumPlayedTime.current = 0;
    mediaReadyRoundRef.current = null;
    clipLoadedRoundRef.current = null;
    playbackPreparedRoundRef.current =
      null;
    playbackSyncRoundRef.current = null;
    playbackRepairRoundRef.current =
      null;
    phaseNavigationStartedRef.current =
      false;
    clipFailedRoundRef.current = null;
    timeoutLoggedRoundRef.current = null;

    if (clipStartTimeoutRef.current) {
      window.clearTimeout(
        clipStartTimeoutRef.current
      );
      clipStartTimeoutRef.current = null;
    }

    const media = mediaRef.current;

    if (media && !media.paused) {
      media.pause();
    }

    setMediaReady(false);
    setMediaStarted(false);
    setMediaFailed(false);
    setMediaStarting(false);
    setHintPending(false);
    setSubmitting(false);
    setAnswer("");
    setAnswerResult(null);
    setError("");
    setSpeechListening(false);
    speechRecognitionRef.current?.stop();
  }, [roundData?.roundId]);

  const syncRoundState = useCallback(
    async () => {
      if (!roomId) {
        return;
      }

      try {
        const nextRound =
          await getCurrentMovieBuffRound(
            roomId
          );

        setRoundData((currentRound) => {
          if (
            !currentRound ||
            currentRound.roundId !==
              nextRound.roundId ||
            currentRound.startedAt !==
              nextRound.startedAt ||
            currentRound.timeLeftSeconds !==
              nextRound.timeLeftSeconds ||
            currentRound.playbackStartedAt !==
              nextRound.playbackStartedAt ||
            currentRound.hintUsed !==
              nextRound.hintUsed ||
            currentRound.hintPenaltySeconds !==
              nextRound.hintPenaltySeconds
          ) {
            setTimeLeft(
              Math.max(
                nextRound.timeLeftSeconds,
                0
              )
            );

            return nextRound;
          }

          return currentRound;
        });
      } catch {
        // Keep the local round state if sync refresh fails.
      }
    },
    [roomId]
  );

  useEffect(() => {
    syncRoundStateRef.current =
      syncRoundState;
  }, [syncRoundState]);

  const repairPlaybackState = useCallback(
    async (targetRoomId: string) => {
      const activeRoundId =
        roundData?.roundId ?? null;

      if (
        !targetRoomId ||
        !activeRoundId ||
        playbackRepairRoundRef.current ===
          activeRoundId
      ) {
        return null;
      }

      const session =
        await getCurrentSession();

      if (!session?.access_token) {
        return null;
      }

      playbackRepairRoundRef.current =
        activeRoundId;

      try {
        const response = await fetch(
          "/api/movie-buff/repair-playback",
          {
            method: "POST",
            headers: {
              "content-type":
                "application/json",
              authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              roomId: targetRoomId,
            }),
          }
        );

        const payload = (await response
          .json()
          .catch(() => null)) as
          | MovieBuffPlaybackRepairPayload
          | null;

        if (!response.ok) {
          throw new Error(
            payload?.error ??
              "Playback reconciliation failed."
          );
        }

        const repairedPlaybackStartedAt =
          payload?.playbackStartedAt ?? null;

        if (
          payload?.roundId === activeRoundId &&
          repairedPlaybackStartedAt
        ) {
          setRoundData((currentRound) => {
            if (
              !currentRound ||
              currentRound.roundId !==
                payload.roundId ||
              currentRound.playbackStartedAt ===
                repairedPlaybackStartedAt
            ) {
              return currentRound;
            }

            return {
              ...currentRound,
              playbackStartedAt:
                repairedPlaybackStartedAt,
            };
          });
          setMediaStarted(true);
          setMediaStarting(false);
        }

        return payload;
      } catch (repairError) {
        playbackRepairRoundRef.current =
          null;
        throw repairError;
      }
    },
    [roundData?.roundId]
  );

  useEffect(() => {
    repairPlaybackStateRef.current =
      repairPlaybackState;
  }, [repairPlaybackState]);

  useEffect(() => {
    if (
      !roomId ||
      loading ||
      answerResult
    ) {
      return;
    }

    const timer = window.setInterval(() => {
      void syncRoundState();
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [
    answerResult,
    loading,
    roomId,
    syncRoundState,
  ]);

  useEffect(() => {
    if (!roomId || loading) {
      return;
    }

    let active = true;

    void syncPhaseRoute({
      fallbackRoundId:
        roundData?.roundId ?? null,
    }).catch(() => false);

    const timer = window.setInterval(() => {
      void syncPhaseRoute({
        fallbackRoundId:
          roundData?.roundId ?? null,
      }).catch(() => {
        if (!active) {
          return false;
        }

        return false;
      });
    }, 1500);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [
    loading,
    roomId,
    roundData?.roundId,
    syncPhaseRoute,
  ]);

  useEffect(() => {
    if (
      timeLeft > 0 &&
      !answerResult
    ) {
      return;
    }

    const media = mediaRef.current;

    if (media && !media.paused) {
      media.pause();
    }
  }, [answerResult, timeLeft]);

  useEffect(() => {
    if (!roundData?.playbackStartedAt) {
      return;
    }

    if (clipStartTimeoutRef.current) {
      window.clearTimeout(
        clipStartTimeoutRef.current
      );
      clipStartTimeoutRef.current = null;
    }

    setMediaStarted(true);
    setMediaStarting(false);
  }, [roundData?.playbackStartedAt]);

  useEffect(() => {
    if (
      !roomId ||
      !roundData?.roundId ||
      answerResult ||
      timeLeft > 0 ||
      timeoutLoggedRoundRef.current ===
        roundData.roundId
    ) {
      return;
    }

    timeoutLoggedRoundRef.current =
      roundData.roundId;

    queueMovieBuffEvent({
      eventType: "timeout",
      roomId,
      matchId: roundData.matchId,
      roundId: roundData.roundId,
      payload: {
        clipType:
          roundData.clipType?.toLowerCase() ??
          "trivia",
      },
    });
  }, [answerResult, roomId, roundData, timeLeft]);

  useEffect(() => {
    if (
      !roomId ||
      loading ||
      redirectStarted.current
    ) {
      return;
    }

    const answerWasSubmitted =
      answerResult !== null;

    const timerExpired =
      roundData !== null &&
      timeLeft === 0 &&
      !submitting;

    if (
      !answerWasSubmitted &&
      !timerExpired
    ) {
      return;
    }

    const delay = answerWasSubmitted
      ? 2500
      : 1200;

    console.info(
      "[movie-buff-play] scheduling results redirect",
      {
        roomId,
        roundId:
          roundData?.roundId ?? null,
        answerWasSubmitted,
        timerExpired,
        delay,
        phasePath:
          typeof window !==
          "undefined"
            ? window.location.pathname
            : null,
      }
    );

    const redirectTimer =
      window.setTimeout(() => {
        redirectStarted.current = true;

        console.info(
          "[movie-buff-play] redirect timer fired",
          {
            roomId,
            roundId:
              roundData?.roundId ?? null,
            answerWasSubmitted,
            timerExpired,
            phasePath:
              window.location.pathname,
          }
        );

        void syncPhaseRoute({
          advance: true,
          fallbackRoundId:
            roundData?.roundId ?? null,
        })
          .then((navigated) => {
            if (
              navigated ||
              !roomId ||
              !roundData?.roundId
            ) {
              return;
            }

            phaseNavigationStartedRef.current =
              true;
            navigateTo(
              `/games/movie-buff/round-results?roomId=${encodeURIComponent(
                roomId
              )}&roundId=${encodeURIComponent(
                roundData.roundId
              )}`,
              true
            );
          })
          .catch(() => {
            if (
              !roomId ||
              !roundData?.roundId
            ) {
              return;
            }

            phaseNavigationStartedRef.current =
              true;
            navigateTo(
              `/games/movie-buff/round-results?roomId=${encodeURIComponent(
                roomId
              )}&roundId=${encodeURIComponent(
                roundData.roundId
              )}`,
              true
            );
          });
      }, delay);

    return () => {
      window.clearTimeout(
        redirectTimer
      );
    };
  }, [
    answerResult,
    loading,
    roomId,
    roundData,
    navigateTo,
    submitting,
    syncPhaseRoute,
    timeLeft,
  ]);

  const currentPlayer = useMemo(
    () =>
      players.find(
        (player) =>
          player.player_id === playerId
      ) ?? null,
    [playerId, players]
  );

  const leaderboard = useMemo(
    () =>
      [...players]
        .sort((a, b) => {
          if (b.score !== a.score) {
            return b.score - a.score;
          }

          return a.joined_at.localeCompare(
            b.joined_at
          );
        })
        .map((player, index) => ({
          rank: index + 1,
          id: player.player_id,
          name: getPlayerName(player),
          score: player.score,
          tier: getMovieBuffPlayerTier(player.score),
        })),
    [players]
  );

  const round =
    roundData?.roundNumber ??
    Math.max(
      room?.current_round ?? 1,
      1
    );

  const totalRounds =
    roundData?.totalRounds ??
    room?.total_rounds ??
    10;

  const progress = Math.min(
    (round / totalRounds) * 100,
    100
  );

  const clipType =
    roundData?.clipType?.toLowerCase() ??
    "trivia";

  const mediaUrl = useMemo(() => {
    const storedMediaUrl =
      roundData?.mediaUrl?.trim() ?? "";

    if (
      (clipType === "video" ||
        clipType === "audio") &&
      roundData?.roundId
    ) {
      return `/api/movie-buff/round-media/${roundData.roundId}`;
    }

    return storedMediaUrl;
  }, [
    clipType,
    roundData?.mediaUrl,
    roundData?.roundId,
  ]);

  const isVideo =
    clipType === "video" &&
    mediaUrl.length > 0;

  const isAudio =
    clipType === "audio" &&
    mediaUrl.length > 0;

  const isImage =
    ["image", "poster"].includes(
      clipType
    ) && mediaUrl.length > 0;

  const hasPlayableMedia =
    isVideo || isAudio;

  const shouldUseTriviaFallback =
    mediaFailed ||
    (!hasPlayableMedia && !isImage);

  const canUseHint =
    hasPlayableMedia &&
    !mediaFailed &&
    !mediaStarted &&
    !mediaStarting &&
    !hintPending &&
    !answerResult &&
    timeLeft > 0 &&
    !roundData?.hintUsed &&
    !roundData?.playbackStartedAt;

  useEffect(() => {
    if (
      !roomId ||
      !roundData?.roundId ||
      !hasPlayableMedia ||
      !mediaReady ||
      mediaFailed
    ) {
      return;
    }

    if (
      clipLoadedRoundRef.current !==
      roundData.roundId
    ) {
      clipLoadedRoundRef.current =
        roundData.roundId;
      queueMovieBuffEvent({
        eventType: "clip_loaded",
        roomId,
        matchId: roundData.matchId,
        roundId: roundData.roundId,
        payload: {
          clipType,
        },
      });
    }

    if (
      roundData.startedAt ||
      roundData.playbackStartedAt ||
      mediaReadyRoundRef.current ===
        roundData.roundId
    ) {
      return;
    }

    mediaReadyRoundRef.current =
      roundData.roundId;

    let cancelled = false;

    void markMovieBuffRoundMediaReady(
      roomId
    )
      .then((nextRound) => {
        if (cancelled) {
          return;
        }

        setRoundData(nextRound);
        setTimeLeft(
          Math.max(
            nextRound.timeLeftSeconds,
            0
          )
        );

        queueMovieBuffEvent({
          eventType: "media_ready",
          roomId,
          matchId: nextRound.matchId,
          roundId: nextRound.roundId,
          payload: {
            clipType,
          },
        });
      })
      .catch(() => {
        if (
          mediaReadyRoundRef.current ===
          roundData.roundId
        ) {
          mediaReadyRoundRef.current = null;
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    clipType,
    hasPlayableMedia,
    mediaFailed,
    mediaReady,
    roomId,
    roundData,
  ]);

  const displayedStartWindowLeft =
    useMemo(() => {
      if (
        !roundData ||
        roundData.playbackStartedAt ||
        answerResult ||
        timeLeft === 0
      ) {
        return null;
      }

      return Math.max(timeLeft, 0);
    }, [
      answerResult,
      roundData,
      timeLeft,
    ]);

  useEffect(() => {
    return () => {
      if (clipStartTimeoutRef.current) {
        window.clearTimeout(
          clipStartTimeoutRef.current
        );
      }
    };
  }, []);

  useEffect(() => {
    if (
      !speechRecognitionRef.current ||
      (!answerResult && timeLeft > 0)
    ) {
      return;
    }

    speechRecognitionRef.current.stop();
  }, [answerResult, timeLeft]);

  function toggleSpeechRecognition() {
    const recognition =
      speechRecognitionRef.current;

    if (
      timeLeft === 0 ||
      !speechRecognitionAvailable ||
      submitting ||
      answerResult
    ) {
      return;
    }

    if (!recognition) {
      setError(
        "Microphone answers are not available in this browser."
      );
      return;
    }

    setError("");

    if (speechListening) {
      recognition.stop();
      return;
    }

    try {
      recognition.start();
    } catch {
      setSpeechListening(false);
      setError(
        "Microphone recognition could not start. Check microphone access and try again."
      );
    }
  }

  async function handleLeaveMatch() {
    if (leaving) {
      return;
    }

    const resolvedRoomId =
      roomId ||
      new URLSearchParams(window.location.search).get(
        "roomId"
      ) ||
      "";

    if (!resolvedRoomId) {
      navigateTo("/games/movie-buff/lobby");
      return;
    }

    setLeaving(true);
    setError("");
    speechRecognitionRef.current?.stop();

    if (clipStartTimeoutRef.current) {
      window.clearTimeout(
        clipStartTimeoutRef.current
      );
    }

    const media = mediaRef.current;

    if (media && !media.paused) {
      media.pause();
    }

    try {
      await leaveCurrentRoom(resolvedRoomId);
      navigateTo("/games/movie-buff/lobby");
    } catch (leaveError) {
      setError(
        leaveError instanceof Error
          ? leaveError.message
          : "Unable to leave the match."
      );
    } finally {
      setLeaving(false);
    }
  }

  function logClipFailure(
    reason: string,
    payload?: Record<string, unknown>
  ) {
    if (
      !roomId ||
      !roundData?.roundId ||
      clipFailedRoundRef.current ===
        roundData.roundId
    ) {
      return;
    }

    clipFailedRoundRef.current =
      roundData.roundId;

    queueMovieBuffEvent({
      eventType: "clip_failed_to_load",
      roomId,
      matchId: roundData.matchId,
      roundId: roundData.roundId,
      payload: {
        clipType,
        reason,
        ...payload,
      },
    });
  }

  function handleMediaLoaded() {
    setMediaReady(true);
  }

  function handlePlaybackStartFailure(
    playbackError: unknown
  ) {
    const media = mediaRef.current;
    const nextMessage =
      playbackError instanceof Error
        ? playbackError.message
        : "The media could not be played or synced. The trivia prompt is available instead.";

    if (media && !media.paused) {
      media.pause();
    }

    if (media) {
      try {
        media.currentTime = 0;
      } catch {
        // Ignore currentTime reset failures.
      }
    }

    playbackSyncRoundRef.current = null;
    setMediaStarted(false);
    setMediaStarting(false);

    if (
      nextMessage ===
      "Time has expired for this round."
    ) {
      logClipFailure(
        "start_window_expired",
        {
          message: nextMessage,
        }
      );
      setTimeLeft(0);
      setError(nextMessage);
      return;
    }

    setMediaFailed(true);
    logClipFailure(
      "playback_start_failed",
      {
        message: nextMessage,
      }
    );

    setError(nextMessage);
  }

  function handleMediaError() {
    setMediaFailed(true);
    logClipFailure("media_element_error");
  }

  async function syncPlaybackStarted() {
    const media = mediaRef.current;
    const activeRoundId =
      roundData?.roundId ?? null;

    if (
      !roomId ||
      !roundData ||
      !media ||
      !activeRoundId ||
      media.paused
    ) {
      return;
    }

    if (roundData.playbackStartedAt) {
      setMediaStarted(true);
      setMediaStarting(false);
      return;
    }

    if (
      playbackSyncRoundRef.current ===
      activeRoundId
    ) {
      return;
    }

    playbackSyncRoundRef.current =
      activeRoundId;

    try {
      const nextRound =
        await startMovieBuffRoundPlayback(
          roomId
        );

      setRoundData(nextRound);
      setTimeLeft(
        Math.max(
          nextRound.timeLeftSeconds,
          0
        )
      );
      setMediaStarted(true);

      queueMovieBuffEvent({
        eventType: "clip_started",
        roomId,
        matchId: nextRound.matchId,
        roundId: nextRound.roundId,
        payload: {
          clipType,
        },
      });
    } catch (playbackError) {
      handlePlaybackStartFailure(
        playbackError
      );
      return;
    }

    setMediaStarting(false);
  }

  function handleMediaPlaying() {
    void syncPlaybackStarted();
  }

  async function beginMedia() {
    const media = mediaRef.current;
    const activeRoundId =
      roundData?.roundId ?? null;

    if (
      !roomId ||
      !media ||
      mediaStarted ||
      timeLeft === 0 ||
      answerResult
    ) {
      return;
    }

    setMediaStarting(true);
    setError("");

    if (clipStartTimeoutRef.current) {
      window.clearTimeout(
        clipStartTimeoutRef.current
      );
    }

    clipStartTimeoutRef.current =
      window.setTimeout(async () => {
        clipStartTimeoutRef.current = null;

        try {
          if (
            activeRoundId &&
            playbackPreparedRoundRef.current !==
              activeRoundId
          ) {
            const preparedRound =
              await prepareMovieBuffRoundPlayback(
                roomId
              );

            playbackPreparedRoundRef.current =
              preparedRound.roundId;
            setRoundData(preparedRound);
            setTimeLeft(
              Math.max(
                preparedRound.timeLeftSeconds,
                0
              )
            );

            queueMovieBuffEvent({
              eventType:
                "clip_start_requested",
              roomId,
              matchId:
                preparedRound.matchId,
              roundId:
                preparedRound.roundId,
              payload: {
                clipType,
                },
              });
          }

          await media.play();

          if (
            !media.paused &&
            media.currentTime > 0
          ) {
            void syncPlaybackStarted();
          }
        } catch (playbackError) {
          handlePlaybackStartFailure(
            playbackError
          );
        }
      }, CLIP_PLAYBACK_DELAY_MS);
  }

  async function useHint() {
    if (!roomId || !canUseHint) {
      return;
    }

    setHintPending(true);
    setError("");

    try {
      const nextRound =
        await requestMovieBuffRoundHint(
          roomId,
          HINT_TIME_PENALTY_SECONDS
        );

      setRoundData(nextRound);
      setTimeLeft(
        Math.max(
          nextRound.timeLeftSeconds,
          0
        )
      );

      queueMovieBuffEvent({
        eventType: "hint_requested",
        roomId,
        matchId: nextRound.matchId,
        roundId: nextRound.roundId,
        payload: {
          penaltySeconds:
            nextRound.hintPenaltySeconds ||
            HINT_TIME_PENALTY_SECONDS,
          clipType,
        },
      });
    } catch (hintError) {
      setError(
        hintError instanceof Error
          ? hintError.message
          : "Unable to use the hint."
      );
    } finally {
      setHintPending(false);
    }
  }

  function handleMediaTimeUpdate() {
    const media = mediaRef.current;

    if (!media) {
      return;
    }

    maximumPlayedTime.current =
      Math.max(
        maximumPlayedTime.current,
        media.currentTime
      );

    if (
      !mediaStarted &&
      !media.paused &&
      media.currentTime > 0 &&
      !roundData?.playbackStartedAt
    ) {
      void syncPlaybackStarted();
    }
  }

  function preventSkippingAhead() {
    const media = mediaRef.current;

    if (!media) {
      return;
    }

    if (
      media.currentTime >
      maximumPlayedTime.current + 0.5
    ) {
      media.currentTime =
        maximumPlayedTime.current;
    }
  }

  async function submitAnswer(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const cleanedAnswer =
      answer.trim();

    if (
      !cleanedAnswer ||
      timeLeft === 0 ||
      submitting ||
      answerResult
    ) {
      return;
    }

    const submittingRoundId =
      roundData?.roundId ?? null;

    setSubmitting(true);
    setError("");
    speechRecognitionRef.current?.stop();

    try {
      let result: MovieBuffAnswerResult;

      try {
        result =
          await submitMovieBuffAnswer(
            roomId,
            cleanedAnswer
          );
      } catch (submitError) {
        const shouldRepairAndRetry =
          submitError instanceof Error &&
          /answer window is not open/i.test(
            submitError.message
          );

        if (!shouldRepairAndRetry) {
          throw submitError;
        }

        const repairPayload =
          await repairPlaybackState(roomId);

        const repairedPlaybackStartedAt =
          repairPayload?.playbackStartedAt ??
          null;

        if (repairedPlaybackStartedAt) {
          setRoundData((currentRound) => {
            if (!currentRound) {
              return currentRound;
            }

            return {
              ...currentRound,
              playbackStartedAt:
                repairedPlaybackStartedAt,
            };
          });
          setMediaStarted(true);
          setMediaStarting(false);
        }

        result =
          await submitMovieBuffAnswer(
            roomId,
            cleanedAnswer
          );
      }

      if (
        submittingRoundId &&
        activeRoundIdRef.current !==
          submittingRoundId
      ) {
        console.info(
          "[movie-buff-play] ignoring stale answer result",
          {
            submittingRoundId,
            activeRoundId:
              activeRoundIdRef.current,
          }
        );
        return;
      }

      setAnswerResult(result);
      setTimeLeft(0);

      await loadPlayers(
        roomId,
        playerId
      );
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to submit the answer."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <p className="text-2xl font-black">
          Loading round...
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <header className="border-b border-zinc-800 bg-zinc-950">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <button
            type="button"
            onClick={handleLeaveMatch}
            disabled={leaving}
            className="flex items-center gap-2 font-black text-zinc-300 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ArrowLeft size={20} />
            {leaving
              ? "Leaving..."
              : "Leave Match"}
          </button>

          <div className="text-center">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-red-500">
              Live Match
            </p>

            <h1 className="text-2xl font-black">
              Movie Buff
            </h1>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-zinc-800 px-4 py-3">
            <Star
              size={20}
              className="text-yellow-400"
            />

            <div>
              <p className="text-xs text-zinc-500">
                Score
              </p>

              <p className="font-black">
                {(
                  currentPlayer?.score ??
                  0
                ).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-8">
        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-700 bg-red-950/40 p-4 font-bold text-red-300">
            <AlertTriangle
              className="mt-0.5 shrink-0"
              size={20}
            />

            <p>{error}</p>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-4">
          <StatCard
            icon={
              <Film className="text-red-500" />
            }
            label="Round"
            value={`${round} of ${totalRounds}`}
          />

          <StatCard
            icon={
              <Clock3 className="text-red-500" />
            }
            label="Time Left"
            value={`${timeLeft} seconds`}
          />

          <StatCard
            icon={
              <Flame className="text-orange-500" />
            }
            label="Streak"
            value={`${
              currentPlayer?.current_streak ??
              0
            } correct`}
          />

          <StatCard
            icon={
              <Heart className="text-red-500" />
            }
            label="Lives"
            value={`${
              currentPlayer?.lives ?? 3
            } remaining`}
          />
        </div>

        <div className="mt-8 h-3 overflow-hidden rounded-full bg-zinc-900">
          <div
            className="h-full rounded-full bg-red-600 transition-all"
            style={{
              width: `${progress}%`,
            }}
          />
        </div>

        <div className="mt-8 grid gap-8 xl:grid-cols-[1fr_340px]">
          <div className="space-y-6">
            <div className="relative min-h-[420px] overflow-hidden rounded-3xl border border-zinc-800 bg-gradient-to-br from-zinc-950 to-black">
              <div className="absolute right-5 top-5 z-30 flex h-16 w-16 items-center justify-center rounded-full border-4 border-red-600 bg-black/90 text-xl font-black shadow-xl">
                {timeLeft}
              </div>

              {isVideo &&
                !mediaFailed && (
                  <div className="relative flex min-h-[420px] items-center justify-center bg-black">
                    <video
                      key={
                        roundData?.roundId ??
                        mediaUrl
                      }
                      ref={(element) => {
                        mediaRef.current =
                          element;
                      }}
                      src={mediaUrl}
                      preload="metadata"
                      playsInline
                      controls={false}
                      disablePictureInPicture
                      controlsList="nodownload noplaybackrate noremoteplayback"
                       onLoadedData={
                         handleMediaLoaded
                       }
                       onCanPlay={
                         handleMediaLoaded
                       }
                       onPlaying={
                         handleMediaPlaying
                       }
                       onError={
                         handleMediaError
                       }
                      onTimeUpdate={
                        handleMediaTimeUpdate
                      }
                      onSeeking={
                        preventSkippingAhead
                      }
                      onContextMenu={(
                        event
                      ) =>
                        event.preventDefault()
                      }
                      className="h-full max-h-[560px] w-full object-contain"
                    />

                    {!mediaStarted && (
                      <MediaStartOverlay
                        mediaReady={
                          mediaReady
                        }
                        mediaStarting={
                          mediaStarting
                        }
                        hintPending={
                          hintPending
                        }
                        label="Play Movie Clip"
                        hintText={
                          roundData?.hintText ??
                          null
                        }
                        hintUsed={
                          roundData?.hintUsed ??
                          false
                        }
                        hintPenaltySeconds={
                          roundData?.hintPenaltySeconds ??
                          HINT_TIME_PENALTY_SECONDS
                        }
                        startWindowSecondsLeft={
                          displayedStartWindowLeft
                        }
                        canUseHint={
                          canUseHint
                        }
                        onUseHint={useHint}
                        onStart={
                          beginMedia
                        }
                      />
                    )}
                  </div>
                )}

              {isAudio &&
                !mediaFailed && (
                  <div className="relative flex min-h-[420px] items-center justify-center p-8">
                    <audio
                      key={
                        roundData?.roundId ??
                        mediaUrl
                      }
                      ref={(element) => {
                        mediaRef.current =
                          element;
                      }}
                      src={mediaUrl}
                      preload="metadata"
                      controls={false}
                      controlsList="nodownload noplaybackrate"
                       onLoadedData={
                         handleMediaLoaded
                       }
                       onCanPlay={
                         handleMediaLoaded
                       }
                       onPlaying={
                         handleMediaPlaying
                       }
                       onError={
                         handleMediaError
                       }
                      onTimeUpdate={
                        handleMediaTimeUpdate
                      }
                      onSeeking={
                        preventSkippingAhead
                      }
                    />

                    <div className="max-w-2xl text-center">
                      <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-red-600 shadow-2xl shadow-red-600/30">
                        <Volume2 size={52} />
                      </div>

                      <p className="mt-7 text-sm font-black uppercase tracking-[0.3em] text-red-500">
                        Audio Challenge
                      </p>

                      <h2 className="mt-4 text-3xl font-black">
                        Listen carefully and name
                        the movie.
                      </h2>
                    </div>

                    {!mediaStarted && (
                      <MediaStartOverlay
                        mediaReady={
                          mediaReady
                        }
                        mediaStarting={
                          mediaStarting
                        }
                        hintPending={
                          hintPending
                        }
                        label="Play Audio Clip"
                        hintText={
                          roundData?.hintText ??
                          null
                        }
                        hintUsed={
                          roundData?.hintUsed ??
                          false
                        }
                        hintPenaltySeconds={
                          roundData?.hintPenaltySeconds ??
                          HINT_TIME_PENALTY_SECONDS
                        }
                        startWindowSecondsLeft={
                          displayedStartWindowLeft
                        }
                        canUseHint={
                          canUseHint
                        }
                        onUseHint={useHint}
                        onStart={
                          beginMedia
                        }
                      />
                    )}
                  </div>
                )}

              {isImage &&
                !mediaFailed && (
                  <div className="relative flex min-h-[420px] items-center justify-center bg-black p-6">
                    {!mediaReady && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center bg-black">
                        <p className="font-black text-zinc-400">
                          Loading image...
                        </p>
                      </div>
                    )}

                    <Image
                      key={
                        roundData?.roundId ??
                        mediaUrl
                      }
                      src={mediaUrl}
                      alt="Movie challenge"
                      fill
                      sizes="100vw"
                      unoptimized
                      draggable={false}
                      onLoad={() =>
                        setMediaReady(true)
                      }
                      onError={() =>
                        setMediaFailed(true)
                      }
                      onContextMenu={(
                        event
                      ) =>
                        event.preventDefault()
                      }
                      className="max-h-[560px] w-full select-none object-contain"
                    />

                    <div className="absolute bottom-5 left-5 flex items-center gap-2 rounded-full border border-zinc-700 bg-black/85 px-4 py-2 text-sm font-black">
                      <ImageIcon
                        size={18}
                        className="text-red-500"
                      />
                      Visual Challenge
                    </div>
                  </div>
                )}

              {shouldUseTriviaFallback && (
                <TriviaChallenge
                  prompt={
                    roundData?.prompt ??
                    "Name this movie."
                  }
                  quoteText={
                    roundData?.quoteText ??
                    null
                  }
                  mediaFailed={
                    mediaFailed
                  }
                />
              )}
            </div>

            <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-7">
              <h2 className="text-2xl font-black">
                Name This Movie
              </h2>

              <p className="mt-2 text-zinc-500">
                Enter the complete movie title
                before time expires.
                {!roundData?.playbackStartedAt
                  ? " The clock starts when playback begins."
                  : ""}
              </p>

              {answerResult ? (
                <div
                  className={`mt-6 rounded-2xl border p-6 ${
                    answerResult.isCorrect
                      ? "border-green-700 bg-green-500/10"
                      : "border-red-700 bg-red-500/10"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {answerResult.isCorrect ? (
                      <CheckCircle2 className="text-green-400" />
                    ) : (
                      <XCircle className="text-red-400" />
                    )}

                    <p
                      className={`font-black uppercase tracking-widest ${
                        answerResult.isCorrect
                          ? "text-green-400"
                          : "text-red-400"
                      }`}
                    >
                      {answerResult.isCorrect
                        ? "Correct"
                        : "Incorrect"}
                    </p>
                  </div>

                  <p className="mt-4 text-zinc-400">
                    Correct answer
                  </p>

                  <p className="text-2xl font-black">
                    {
                      answerResult.correctTitle
                    }
                  </p>

                  <p className="mt-5 text-3xl font-black text-yellow-400">
                    +
                    {answerResult.totalPoints.toLocaleString()}{" "}
                    points
                  </p>

                  {answerResult.hintBonus > 0 && (
                    <p className="mt-3 text-sm font-bold uppercase tracking-[0.2em] text-blue-300">
                      Includes +{answerResult.hintBonus} hint bonus
                    </p>
                  )}

                  <p className="mt-4 text-sm font-bold text-zinc-400">
                    Loading round results...
                  </p>
                </div>
              ) : (
                <form
                  onSubmit={submitAnswer}
                  className="mt-6 flex flex-col gap-4 sm:flex-row"
                >
                  <input
                    value={answer}
                    onChange={(event) =>
                      setAnswer(
                        event.target.value
                      )
                    }
                    disabled={
                      timeLeft === 0 ||
                      submitting
                    }
                    placeholder="Enter the movie title"
                    autoComplete="off"
                    className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-black px-5 py-4 text-lg outline-none transition placeholder:text-zinc-600 focus:border-red-500 disabled:opacity-50"
                  />

                  <button
                    type="button"
                    onClick={toggleSpeechRecognition}
                    disabled={
                      timeLeft === 0 ||
                      !speechRecognitionAvailable ||
                      submitting
                    }
                    className={`flex items-center justify-center gap-3 rounded-xl border px-6 py-4 text-lg font-black transition ${
                      speechListening
                        ? "border-red-500 bg-red-600 text-white hover:bg-red-700"
                        : "border-zinc-700 bg-black text-zinc-200 hover:border-red-500 hover:text-white"
                    } disabled:cursor-not-allowed disabled:border-zinc-800 disabled:bg-zinc-900 disabled:text-zinc-500`}
                    aria-label={
                      speechListening
                        ? "Stop microphone answer"
                        : !speechRecognitionAvailable
                          ? "Microphone answers are unavailable in this browser"
                          : "Use microphone to answer"
                    }
                  >
                    <Mic size={22} />

                    {speechListening
                      ? "Listening..."
                      : speechRecognitionAvailable
                        ? "Use Mic"
                        : "Mic Unavailable"}
                  </button>

                  <button
                    type="submit"
                    disabled={
                      !answer.trim() ||
                      timeLeft === 0 ||
                      submitting
                    }
                    className="flex items-center justify-center gap-3 rounded-xl bg-red-600 px-8 py-4 text-lg font-black transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
                  >
                    <Send size={22} />

                    {submitting
                      ? "Submitting..."
                      : "Submit Answer"}
                  </button>
                </form>
              )}

              {!speechRecognitionAvailable &&
                !answerResult && (
                  <p className="mt-3 text-sm font-bold text-zinc-500">
                    Voice answers are not available in this browser. Type your
                    answer instead.
                  </p>
                )}

              {timeLeft === 0 &&
                !answerResult && (
                  <div className="mt-6 rounded-2xl border border-red-700 bg-red-500/10 p-5">
                    <p className="font-black text-red-400">
                      Time is up.
                    </p>

                    <p className="mt-2 text-sm font-bold text-zinc-400">
                      Loading round results...
                    </p>
                  </div>
                )}
            </div>

            <div className="rounded-3xl border border-red-700/50 bg-gradient-to-br from-red-950/40 via-zinc-950 to-black p-7">
              <div className="flex items-start gap-4">
                <div className="rounded-2xl bg-red-600 p-4">
                  <Bot size={32} />
                </div>

                <div>
                  <p className="text-sm font-black uppercase tracking-[0.25em] text-red-400">
                    Buff Says
                  </p>

                  <p className="mt-2 text-xl font-black">
                    Watch or listen closely.
                    You only get one playback
                    attempt.
                  </p>

                  <p className="mt-3 text-sm font-bold text-zinc-400">
                    One hint is available to you
                    before playback starts.{" "}
                    {getMovieBuffDifficultyLabel("easy")} gives a
                    fuller clue, while{" "}
                    {getMovieBuffDifficultyLabel("medium")} and{" "}
                    {getMovieBuffDifficultyLabel("hard")} keep the
                    hint tighter. It costs{" "}
                    {HINT_TIME_PENALTY_SECONDS} seconds, and a
                    correct answer before playback
                    earns a 100-point bonus.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <aside className="rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-widest text-red-500">
                  Live
                </p>

                <h2 className="text-2xl font-black">
                  Leaderboard
                </h2>
              </div>

              <Trophy className="text-yellow-400" />
            </div>

            <div className="mt-6 space-y-4">
              {leaderboard.map(
                (player) => (
                  <div
                    key={player.id}
                    className={`flex items-center justify-between rounded-2xl border p-4 ${
                      player.id ===
                      playerId
                        ? "border-red-600 bg-red-600/10"
                        : "border-zinc-800 bg-black"
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-900 font-black text-red-500">
                        {player.rank}
                      </div>

                      <div className="min-w-0">
                        <p className="truncate font-black">
                          {player.name}
                          {player.id ===
                          playerId
                            ? " (You)"
                            : ""}
                        </p>

                        <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">
                          {player.tier}
                        </p>
                      </div>
                    </div>

                    <p className="ml-3 font-black">
                      {player.score.toLocaleString()}
                    </p>
                  </div>
                )
              )}
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}

function TriviaChallenge({
  prompt,
  quoteText,
  mediaFailed,
}: {
  prompt: string;
  quoteText: string | null;
  mediaFailed: boolean;
}) {
  return (
    <div className="flex min-h-[420px] items-center justify-center p-8">
      <div className="max-w-3xl text-center">
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-red-600">
          {mediaFailed ? (
            <AlertTriangle size={42} />
          ) : (
            <Play
              size={42}
              fill="currentColor"
            />
          )}
        </div>

        <p className="mt-7 text-sm font-black uppercase tracking-[0.3em] text-red-500">
          {mediaFailed
            ? "Trivia Fallback"
            : "Movie Challenge"}
        </p>

        <h2 className="mt-4 text-3xl font-black leading-tight">
          {prompt}
        </h2>

        {quoteText && (
          <p className="mt-6 text-xl italic text-zinc-400">
            “{quoteText}”
          </p>
        )}
      </div>
    </div>
  );
}

function MediaStartOverlay({
  mediaReady,
  mediaStarting,
  hintPending,
  label,
  hintText,
  hintUsed,
  hintPenaltySeconds,
  startWindowSecondsLeft,
  canUseHint,
  onUseHint,
  onStart,
}: {
  mediaReady: boolean;
  mediaStarting: boolean;
  hintPending: boolean;
  label: string;
  hintText: string | null;
  hintUsed: boolean;
  hintPenaltySeconds: number;
  startWindowSecondsLeft: number | null;
  canUseHint: boolean;
  onUseHint: () => void;
  onStart: () => void;
}) {
  const displayedHintPenaltySeconds =
    hintPenaltySeconds > 0
      ? hintPenaltySeconds
      : HINT_TIME_PENALTY_SECONDS;

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center overflow-hidden bg-black/85 p-6 backdrop-blur-sm">
      {!mediaReady || mediaStarting || hintPending ? (
        <div className="relative z-10 flex w-full max-w-2xl flex-col items-center">
          <MovieBuffLoadingTicker
            variant="clip"
            statusLabel={
              mediaStarting
                ? "Starting playback"
                : hintPending
                  ? "Revealing hint"
                  : "Movie ticket loading"
            }
            title={
              mediaStarting
                ? "Starting your clip"
                : hintPending
                  ? "Revealing hint"
                  : "Loading clip"
            }
            subtitle={
              mediaStarting
                ? "Getting the movie moment on screen."
                : hintPending
                  ? "Trading a little time for a clue."
                  : "Getting the next movie moment ready."
            }
          />

          {!mediaStarting && !hintPending ? (
            <div className="mt-6 text-center">
              {startWindowSecondsLeft !==
                null && (
                <p className="text-sm font-bold text-zinc-300">
                  Round auto-ends in{" "}
                  {startWindowSecondsLeft}s if
                  you do not start or answer.
                </p>
              )}

              {canUseHint && (
                <button
                  type="button"
                  onClick={onUseHint}
                  className="mt-4 rounded-full border border-yellow-500/40 bg-yellow-500/10 px-5 py-2 text-sm font-black text-yellow-300 transition hover:border-yellow-400 hover:bg-yellow-500/15"
                >
                  Use Hint (-{displayedHintPenaltySeconds}s)
                </button>
              )}

              {hintUsed && hintText && (
                <div className="mt-4 max-w-xl rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-left">
                  <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-300">
                    Hint Used
                  </p>

                  <p className="mt-2 text-sm font-bold text-yellow-50">
                    {hintText}
                  </p>

                  <p className="mt-2 text-xs font-bold text-yellow-200/80">
                    {displayedHintPenaltySeconds} seconds were deducted from this
                    round. The timer still waits for playback to start.
                  </p>
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="relative z-10 text-center transition-all duration-300">
          <button
            type="button"
            onClick={onStart}
            disabled={mediaStarting}
            className="mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-red-600 shadow-2xl shadow-red-600/30 transition hover:scale-105 hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
            aria-label={label}
          >
            <Play
              size={52}
              fill="currentColor"
            />
          </button>

          <p className="mt-6 text-xl font-black">{label}</p>

          <p className="mt-2 text-sm font-bold text-zinc-500">
            Playback is available once.
          </p>

          {startWindowSecondsLeft !==
            null && (
            <p className="mt-3 text-sm font-bold text-zinc-400">
              Round auto-ends in{" "}
              {startWindowSecondsLeft}s if
              you do not start or answer.
            </p>
          )}

          {canUseHint && (
            <button
              type="button"
              onClick={onUseHint}
              className="mt-5 rounded-full border border-yellow-500/40 bg-yellow-500/10 px-5 py-2 text-sm font-black text-yellow-300 transition hover:border-yellow-400 hover:bg-yellow-500/15"
            >
              Use Hint (-{displayedHintPenaltySeconds}s)
            </button>
          )}

          {hintUsed && hintText && (
            <div className="mt-5 max-w-xl rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-left">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-yellow-300">
                Hint Used
              </p>

              <p className="mt-2 text-sm font-bold text-yellow-50">
                {hintText}
              </p>

              <p className="mt-2 text-xs font-bold text-yellow-200/80">
                {displayedHintPenaltySeconds} seconds were deducted from this round.
                The timer still waits for playback to start.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
      <div className="flex items-center gap-4">
        {icon}

        <div>
          <p className="text-sm text-zinc-500">
            {label}
          </p>

          <p className="text-xl font-black">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}
