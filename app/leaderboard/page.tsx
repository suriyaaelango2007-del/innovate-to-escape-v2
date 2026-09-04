"use client";

import { useEffect, useState } from "react";

type Row = {
  id: string;
  name: string;
  roll_number: string;
  guess_count: number;
  solved: boolean;
  duration_ms: number;
  score: number;
  phase2_score: number;
  phase2_sentence_approved: boolean;
  phase2_finished_at: string | null;
  total_score: number;
  finished_at: string;
};

export default function LeaderboardPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        // Cache-bust with a timestamp so no CDN/browser layer can serve a stale copy
        const res = await fetch(`/api/leaderboard?t=${Date.now()}`, {
          cache: "no-store",
          headers: { "Cache-Control": "no-store" },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load");
        if (!cancelled) {
          setRows(data.leaderboard || []);
          setError(null);
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
  }, [tick]);

  // Auto-refresh every 3s so newly finished games appear quickly during the event
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 3000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="pt-8 sm:pt-12">
      <div className="text-center">
        <h1 className="display text-5xl text-white sm:text-6xl">
          Live <em>leaderboard</em>
        </h1>
        <p className="mt-3 text-sm text-white/60">
          Auto-refreshes every 3s • Ranked by solved → score → time
        </p>
        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            onClick={() => setTick((t) => t + 1)}
            className="pill-ghost text-xs"
          >
            ↻ Refresh now
          </button>
          <span className="text-xs text-white/40">
            {loading ? "Loading…" : `${rows.length} finished ${rows.length === 1 ? "attempt" : "attempts"}`}
          </span>
        </div>
      </div>

      <div className="card mx-auto mt-10 max-w-4xl overflow-x-auto">
        <div className="grid min-w-[720px] grid-cols-[3rem_1fr_5rem_5rem_5rem_5rem_5rem_5rem] items-center gap-2 border-b border-bg-border px-5 py-3 text-xs uppercase tracking-widest text-white/50">
          <span>#</span>
          <span>Player</span>
          <span className="text-right">Guesses</span>
          <span className="text-right">Time</span>
          <span className="text-right">Wordle</span>
          <span className="text-right">Ph. 2</span>
          <span className="text-right">Total</span>
          <span className="text-right">Status</span>
        </div>

        {loading && (
          <div className="p-10 text-center text-white/50">Loading…</div>
        )}
        {error && (
          <div className="p-10 text-center text-red-300">{error}</div>
        )}
        {!loading && !error && rows.length === 0 && (
          <div className="p-10 text-center text-white/50">
            No plays yet. Be the first!
          </div>
        )}

        {rows.map((row, i) => {
          const rank = i + 1;
          const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;
          const total = row.total_score ?? (row.score + (row.phase2_score || 0));
          return (
            <div
              key={row.id}
              className={`grid min-w-[720px] grid-cols-[3rem_1fr_5rem_5rem_5rem_5rem_5rem_5rem] items-center gap-2 border-b border-bg-border/60 px-5 py-4 text-sm ${
                rank === 1 ? "bg-accent/5" : ""
              }`}
            >
              <span className="font-mono text-white/70">
                {medal ? <span className="text-xl">{medal}</span> : rank}
              </span>
              <span className="flex flex-col">
                <span className="text-white">{row.name}</span>
                <span className="font-mono text-xs text-white/40">{row.roll_number}</span>
              </span>
              <span className="text-right font-mono text-white/80">{row.guess_count}</span>
              <span className="text-right font-mono text-white/80">
                {formatTime(row.duration_ms)}
              </span>
              <span className="text-right font-mono text-white/70">{row.score}</span>
              <span className="text-right font-mono text-white/70">
                {row.phase2_finished_at ? (row.phase2_score || 0) : "—"}
              </span>
              <span className="text-right font-mono font-semibold text-accent">{total}</span>
              <span className="text-right">
                {row.solved ? (
                  <span className="rounded-full bg-accent/20 px-2 py-1 text-xs text-accent">
                    Solved
                  </span>
                ) : (
                  <span className="rounded-full bg-white/5 px-2 py-1 text-xs text-white/50">
                    —
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}
