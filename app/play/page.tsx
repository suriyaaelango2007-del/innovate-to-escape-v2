"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import WordleBoard, { BoardState } from "@/components/WordleBoard";
import Phase2Panel from "@/components/Phase2Panel";

type SessionInfo = BoardState & {
  attempt_id: string;
  max_guesses: number;
  time_limit_seconds: number;
  mode: "classic" | "timed" | "tournament";
  phase2_final: boolean;
  name?: string;
  roll_number?: string;
};

// Where we remember the in-progress game. Reopening the browser resumes it
// rather than dropping the player back on the registration form (which used to
// hand them a brand-new word, or a game that looked already-submitted).
const STORAGE_KEY = "ite:attempt_id";

function rememberAttempt(id: string) {
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* private mode */ }
}
function forgetAttempt() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* private mode */ }
}

export default function PlayPage() {
  const { user } = useUser();
  const [name, setName] = useState("");
  const [roll, setRoll] = useState("");
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [result, setResult] = useState<{
    solved: boolean;
    score: number;
    answer: string | null;
  } | null>(null);

  const adopt = useCallback((data: SessionInfo) => {
    setSession(data);
    rememberAttempt(data.attempt_id);
    if (data.name) setName((n) => n || data.name!);
    if (data.roll_number) setRoll((r) => r || data.roll_number!);
    if (data.finished) {
      setResult({
        solved: data.solved,
        score: data.score ?? 0,
        answer: data.answer ?? null,
      });
    }
  }, []);

  // Prefill the name from the signed-in account, without clobbering anything
  // the player has already typed (or that we restored from their attempt).
  useEffect(() => {
    const clerkName = user?.fullName || user?.firstName;
    if (clerkName) setName((n) => n || clerkName);
  }, [user]);

  // Resume on load.
  useEffect(() => {
    let cancelled = false;
    let stored: string | null = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch { /* private mode */ }
    if (!stored) { setRestoring(false); return; }

    fetch(`/api/session?attempt_id=${encodeURIComponent(stored)}&t=${Date.now()}`, {
      cache: "no-store",
    })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (cancelled) return;
        // Attempt deleted (e.g. an organiser cleared it) — drop the stale id.
        if (!ok) { forgetAttempt(); return; }
        adopt(d);
      })
      .catch(() => { /* offline — fall back to the form */ })
      .finally(() => { if (!cancelled) setRestoring(false); });

    return () => { cancelled = true; };
  }, [adopt]);

  async function startGame(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), roll_number: roll.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start game");
      adopt(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  if (restoring) {
    return (
      <div className="pt-20 text-center text-sm text-white/50">Restoring your game…</div>
    );
  }

  return (
    <div className="pt-8 sm:pt-12">
      {!session && (
        <div className="mx-auto max-w-md">
          <div className="text-center">
            <h1 className="display text-4xl text-white sm:text-5xl">
              Ready to <em>play</em>?
            </h1>
            <p className="mt-3 text-sm text-white/60">
              Enter your details to begin. One attempt per roll number — you can close
              this page and come back to finish.
            </p>
          </div>

          <form onSubmit={startGame} className="card mt-8 flex flex-col gap-4 p-6">
            <label className="flex flex-col gap-2">
              <span className="text-xs uppercase tracking-widest text-white/60">
                Full name
              </span>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                placeholder="e.g. Priya Kumar"
                className="rounded-full border border-bg-border bg-bg-soft px-4 py-3 text-base text-white outline-none placeholder:text-white/30 focus:border-accent/60"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-xs uppercase tracking-widest text-white/60">
                Roll number
              </span>
              <input
                required
                value={roll}
                onChange={(e) => setRoll(e.target.value.toUpperCase())}
                maxLength={40}
                placeholder="e.g. 22CS001"
                className="rounded-full border border-bg-border bg-bg-soft px-4 py-3 font-mono text-base uppercase text-white outline-none placeholder:text-white/30 focus:border-accent/60"
              />
            </label>

            {error && (
              <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="pill-primary mt-2 py-3 text-base disabled:opacity-60">
              {loading ? "Starting…" : "Start game →"}
            </button>
          </form>
        </div>
      )}

      {session && (
        <div>
          <WordleBoard
            attemptId={session.attempt_id}
            maxGuesses={session.max_guesses}
            timeLimitSeconds={session.time_limit_seconds}
            mode={session.mode}
            playerName={name || session.name || "Player"}
            initial={session}
            onFinished={setResult}
          />

          {result && (
            <div className="mx-auto mt-8 flex max-w-2xl flex-col items-center gap-3">
              {result.solved && (
                <div className="rounded-full bg-accent/20 px-5 py-2 text-sm font-medium text-accent">
                  Wordle score: {result.score}
                </div>
              )}

              {result.solved && <Phase2Panel attemptId={session.attempt_id} />}

              <div className="mt-4 flex gap-3">
                <Link href="/leaderboard" className="pill-primary">
                  View leaderboard
                </Link>
                <Link href="/my-attempts" className="pill-ghost">
                  My games
                </Link>
                <Link href="/" className="pill-ghost">
                  Home
                </Link>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
