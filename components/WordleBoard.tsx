"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

type LetterStatus = "correct" | "present" | "absent";
type Row = { word: string; status: LetterStatus[] };

export type BoardState = {
  guesses: Row[];
  guess_count: number;
  finished: boolean;
  solved: boolean;
  expired: boolean;
  answer: string | null;
  score: number | null;
  seconds_left: number | null;
  elapsed_seconds: number;
};

type Props = {
  attemptId: string;
  maxGuesses: number;
  timeLimitSeconds: number;
  mode: "classic" | "timed" | "tournament";
  playerName: string;
  /** Server state at load — lets a returning player resume mid-game. */
  initial: BoardState;
  onFinished: (result: { solved: boolean; score: number; answer: string | null }) => void;
};

const KEY_ROWS = [
  "QWERTYUIOP".split(""),
  "ASDFGHJKL".split(""),
  ["ENTER", ..."ZXCVBNM".split(""), "BACK"],
];

export default function WordleBoard({
  attemptId,
  maxGuesses,
  timeLimitSeconds,
  mode,
  playerName,
  initial,
  onFinished,
}: Props) {
  const [rows, setRows] = useState<Row[]>(initial.guesses);
  const [current, setCurrent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [finished, setFinished] = useState(initial.finished);
  const [solved, setSolved] = useState(initial.solved);
  const [expired, setExpired] = useState(initial.expired);
  const [answer, setAnswer] = useState<string | null>(initial.answer);
  const [elapsed, setElapsed] = useState(initial.elapsed_seconds);
  const shakeKey = useRef(0);

  // Absolute times, so the clock survives a tab being backgrounded (setInterval
  // is throttled there — counting ticks would drift badly on mobile).
  const startedAtMs = useRef(Date.now() - initial.elapsed_seconds * 1000);
  const deadlineMs = useRef<number | null>(
    initial.seconds_left != null ? Date.now() + initial.seconds_left * 1000 : null
  );

  // A ref, not the `submitting` state: two keypresses in the same tick share
  // one render, so both would read the stale `submitting === false` and fire
  // two requests for the same guess.
  const inFlight = useRef(false);
  // Same reason — keeps the effects below from re-running on every parent
  // render just because an inline arrow function was passed in.
  const onFinishedRef = useRef(onFinished);
  useEffect(() => { onFinishedRef.current = onFinished; }, [onFinished]);

  // If the attempt was already over when we loaded (e.g. reopened the tab
  // after the clock expired), tell the parent once.
  const announced = useRef(false);
  useEffect(() => {
    if (finished && !announced.current) {
      announced.current = true;
      onFinishedRef.current({ solved, score: initial.score ?? 0, answer });
    }
  }, [finished, solved, answer, initial.score]);

  // Ask the server for the authoritative state. Used when the clock runs out
  // and when a write conflicts — the server closes an expired attempt itself,
  // so this both syncs us and makes the timeout real (the old client-only
  // timeout left the attempt open forever and off the leaderboard).
  const resync = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/session?attempt_id=${encodeURIComponent(attemptId)}&t=${Date.now()}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (!res.ok) return;
      setRows(data.guesses || []);
      if (data.finished) {
        setFinished(true);
        setSolved(!!data.solved);
        setExpired(!!data.expired);
        setAnswer(data.answer ?? null);
        if (!announced.current) {
          announced.current = true;
          onFinishedRef.current({
            solved: !!data.solved,
            score: data.score ?? 0,
            answer: data.answer ?? null,
          });
        }
      }
    } catch {
      /* offline — the next action will retry */
    }
  }, [attemptId]);

  // Clock
  useEffect(() => {
    if (finished) return;
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAtMs.current) / 1000));
    }, 250);
    return () => clearInterval(id);
  }, [finished]);

  // Time-out — hand off to the server rather than deciding locally.
  const timedOut = useRef(false);
  useEffect(() => {
    if (finished || timedOut.current) return;
    if (deadlineMs.current == null) return;
    if (Date.now() < deadlineMs.current) return;
    timedOut.current = true;
    resync();
  }, [elapsed, finished, resync]);

  const submitGuess = useCallback(
    async (word: string) => {
      if (inFlight.current || finished) return;
      if (word.length !== 5) {
        setError("Need 5 letters");
        shakeKey.current++;
        return;
      }
      inFlight.current = true;
      setSubmitting(true);
      setError(null);
      try {
        const res = await fetch("/api/guess", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attempt_id: attemptId, guess: word }),
        });
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Guess failed");
          shakeKey.current++;
          // 409s carry the true server state — adopt it instead of leaving the
          // board showing something that never happened.
          if (res.status === 409) {
            if (Array.isArray(data.guesses)) setRows(data.guesses);
            if (data.finished) {
              setFinished(true);
              setSolved(!!data.solved);
              setExpired(!!data.expired);
              setAnswer(data.answer ?? null);
              setCurrent("");
              if (!announced.current) {
                announced.current = true;
                onFinishedRef.current({
                  solved: !!data.solved,
                  score: data.score ?? 0,
                  answer: data.answer ?? null,
                });
              }
            }
          }
          return;
        }

        setRows((r) => [...r, { word, status: data.status }]);
        setCurrent("");
        if (data.finished) {
          setFinished(true);
          setSolved(data.solved);
          setAnswer(data.answer);
          announced.current = true;
          onFinishedRef.current({
            solved: data.solved,
            score: data.score || 0,
            answer: data.answer,
          });
        }
      } catch (e: any) {
        setError(e?.message || "Network error");
        shakeKey.current++;
        // The request may well have landed before the connection dropped;
        // ask the server what actually happened.
        resync();
      } finally {
        inFlight.current = false;
        setSubmitting(false);
      }
    },
    [attemptId, finished, resync]
  );

  // Keyboard input. `current` is read from a ref inside the window listener so
  // the handler identity stays stable.
  const currentRef = useRef(current);
  useEffect(() => { currentRef.current = current; }, [current]);

  const handleKey = useCallback(
    (k: string) => {
      if (finished) return;
      if (k === "ENTER") return void submitGuess(currentRef.current);
      if (k === "BACK") return setCurrent((c) => c.slice(0, -1));
      if (/^[A-Z]$/.test(k)) setCurrent((c) => (c.length < 5 ? c + k : c));
    },
    [finished, submitGuess]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.repeat) return; // held-down keys must not queue guesses
      if (e.key === "Enter") return handleKey("ENTER");
      if (e.key === "Backspace") return handleKey("BACK");
      const k = e.key.toUpperCase();
      if (/^[A-Z]$/.test(k)) handleKey(k);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleKey]);

  // Coming back to a backgrounded tab: re-check with the server.
  useEffect(() => {
    if (finished) return;
    const onVisible = () => { if (document.visibilityState === "visible") resync(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [finished, resync]);

  const timeLeft =
    mode === "timed" && deadlineMs.current != null
      ? Math.max(0, Math.ceil((deadlineMs.current - Date.now()) / 1000))
      : elapsed;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-6">
      {/* Timer / status bar */}
      <div className="flex w-full items-center justify-between text-xs uppercase tracking-widest text-white/60">
        <span>{playerName}</span>
        <span className="font-mono text-accent">
          {mode === "timed" ? "⏱ " : "⏳ "}
          {formatTime(timeLeft)}
        </span>
      </div>

      {/* Grid */}
      <div className="grid w-full gap-2">
        {Array.from({ length: maxGuesses }).map((_, rowIdx) => {
          const filled = rows[rowIdx];
          const isCurrent = !filled && rowIdx === rows.length && !finished;
          return (
            <motion.div
              key={rowIdx}
              className="flex w-full gap-2"
              animate={isCurrent && error ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }}
              transition={{ duration: 0.35 }}
            >
              {Array.from({ length: 5 }).map((_, colIdx) => {
                const letter = filled
                  ? filled.word[colIdx]
                  : isCurrent
                  ? current[colIdx] || ""
                  : "";
                const status = filled?.status[colIdx];
                const isTyped = isCurrent && current[colIdx];

                return (
                  <motion.div
                    key={colIdx}
                    initial={false}
                    animate={
                      filled
                        ? { rotateX: [0, 90, 0], scale: [1, 1, 1] }
                        : isTyped
                        ? { scale: [1, 1.08, 1] }
                        : { scale: 1 }
                    }
                    transition={{ duration: filled ? 0.5 : 0.15, delay: filled ? colIdx * 0.12 : 0 }}
                    className={`tile aspect-square h-14 w-14 text-2xl sm:h-16 sm:w-16 sm:text-3xl ${
                      status === "correct" ? "tile-correct" :
                      status === "present" ? "tile-present" :
                      status === "absent" ? "tile-absent" :
                      isTyped ? "tile-filled" : "tile-empty"
                    }`}
                  >
                    {letter}
                  </motion.div>
                );
              })}
            </motion.div>
          );
        })}
      </div>

      {/* Error toast */}
      <AnimatePresence>
        {error && !finished && (
          <motion.div
            key={shakeKey.current}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-full bg-white text-black px-4 py-2 text-sm font-medium"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Finished banner */}
      {finished && (
        <div className="card w-full p-6 text-center">
          <div className="display text-3xl text-white">
            {solved ? (
              <>You <em>escaped</em>!</>
            ) : expired ? (
              <>Time&apos;s <em>up</em></>
            ) : (
              <>Better <em>luck</em> next time</>
            )}
          </div>
          {answer && (
            <p className="mt-2 text-sm text-white/70">
              The word was <span className="font-mono font-bold text-accent">{answer}</span>
            </p>
          )}
        </div>
      )}

      {/* Keyboard */}
      {!finished && (
        <div className="flex w-full flex-col gap-1 sm:gap-1.5">
          {KEY_ROWS.map((row, i) => (
            <div key={i} className="flex w-full justify-center gap-1 sm:gap-1.5">
              {row.map((k) => {
                const wide = k === "ENTER" || k === "BACK";
                return (
                  <button
                    key={k}
                    onClick={() => handleKey(k)}
                    disabled={submitting && k === "ENTER"}
                    className={`kbd ${wide ? "kbd-wide" : ""}`}
                    aria-label={k}
                  >
                    {k === "BACK" ? "⌫" : k}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
