"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type LetterStatus = "correct" | "present" | "absent";
type GuessRow = { word: string; status: LetterStatus[] };

type Phase2 = {
  submitted: boolean;
  submitted_at: string | null;
  words: string[] | null;
  sentence: string | null;
  correct_count: number | null;
  sentence_approved: boolean | null;
  score: number;
  draft: { words: string[]; sentence: string; saved_at: string | null } | null;
};

type Attempt = {
  id: string;
  attempt_number: number;
  mode: string;
  started_at: string;
  finished_at: string | null;
  in_progress: boolean;
  solved: boolean;
  expired: boolean;
  word: string | null;
  guesses: GuessRow[];
  guess_count: number;
  max_guesses: number;
  duration_ms: number;
  score: number | null;
  phase2: Phase2;
  total_score: number;
};

type Summary = {
  total_attempts: number;
  finished: number;
  solved: number;
  best_total: number;
  leaderboard_rank: number | null;
  leaderboard_size: number;
};

type Payload = {
  player: { name: string; roll_number: string } | null;
  attempts: Attempt[];
  summary: Summary;
};

export default function MyAttemptsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/my-attempts?t=${Date.now()}`, { cache: "no-store" })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (cancelled) return;
        if (!ok) setError(d.error || "Could not load your games");
        else setData(d);
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="pt-8 sm:pt-12">
      <div className="text-center">
        <h1 className="display text-5xl text-white sm:text-6xl">
          My <em>games</em>
        </h1>
        <p className="mt-3 text-sm text-white/60">
          {data?.player
            ? <>{data.player.name} · <span className="font-mono">{data.player.roll_number}</span></>
            : "Every game you've played, newest first"}
        </p>
      </div>

      {loading && <div className="p-10 text-center text-white/50">Loading your games…</div>}
      {error && (
        <div className="card mx-auto mt-10 max-w-md p-6 text-center text-red-300">{error}</div>
      )}

      {data && !loading && (
        <>
          <SummaryCards summary={data.summary} />

          {data.attempts.length === 0 ? (
            <div className="card mx-auto mt-10 max-w-md p-10 text-center">
              <div className="display text-2xl text-white">No games yet</div>
              <p className="mt-2 text-sm text-white/60">
                Your results will show up here as soon as you play.
              </p>
              <Link href="/play" className="pill-primary mt-6 inline-block">
                Play now →
              </Link>
            </div>
          ) : (
            <div className="mx-auto mt-10 flex max-w-3xl flex-col gap-6">
              {data.attempts.map((a) => (
                <AttemptCard key={a.id} attempt={a} />
              ))}
            </div>
          )}

          <div className="mt-10 flex justify-center gap-3">
            <Link href="/leaderboard" className="pill-ghost">Leaderboard</Link>
            <Link href="/play" className="pill-ghost">Play</Link>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCards({ summary }: { summary: Summary }) {
  const stats: { label: string; value: string }[] = [
    { label: "Games", value: String(summary.total_attempts) },
    { label: "Solved", value: `${summary.solved}/${summary.finished}` },
    { label: "Best total", value: String(summary.best_total) },
    {
      label: "Rank",
      value: summary.leaderboard_rank
        ? `#${summary.leaderboard_rank}${summary.leaderboard_size ? ` of ${summary.leaderboard_size}` : ""}`
        : "—",
    },
  ];

  return (
    <div className="mx-auto mt-10 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="card p-4 text-center">
          <div className="text-xs uppercase tracking-widest text-white/50">{s.label}</div>
          <div className="mt-1 font-mono text-2xl text-accent">{s.value}</div>
        </div>
      ))}
    </div>
  );
}

function AttemptCard({ attempt: a }: { attempt: Attempt }) {
  return (
    <div className="card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-xs uppercase tracking-widest text-white/50">
            Attempt #{a.attempt_number}
          </span>
          <StatusBadge attempt={a} />
        </div>
        <span className="text-xs text-white/40">{formatDate(a.started_at)}</span>
      </div>

      {/* The word, once the game is over */}
      {a.word && (
        <p className="mt-4 text-sm text-white/70">
          The word was{" "}
          <span className="font-mono font-bold text-accent">{a.word}</span>
        </p>
      )}

      {/* Their actual board */}
      {a.guesses.length > 0 ? (
        <div className="mt-4 flex flex-col gap-1">
          {a.guesses.map((g, i) => (
            <div key={i} className="flex gap-1">
              {g.word.split("").map((letter, j) => (
                <span
                  key={j}
                  className={`tile h-8 w-8 text-sm ${
                    g.status[j] === "correct" ? "tile-correct" :
                    g.status[j] === "present" ? "tile-present" : "tile-absent"
                  }`}
                >
                  {letter}
                </span>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-white/40">No guesses made.</p>
      )}

      {/* Scores */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Guesses" value={`${a.guess_count}/${a.max_guesses}`} />
        <Stat label="Time" value={formatDuration(a.duration_ms)} />
        <Stat label="Wordle" value={a.in_progress ? "—" : String(a.score ?? 0)} />
        <Stat label="Phase 2" value={a.phase2.submitted ? String(a.phase2.score) : "—"} />
      </div>

      {!a.in_progress && (
        <div className="mt-4 flex items-center justify-between rounded-2xl border border-bg-border bg-bg-soft px-4 py-3">
          <span className="text-xs uppercase tracking-widest text-white/60">Total</span>
          <span className="font-mono text-xl font-semibold text-accent">{a.total_score}</span>
        </div>
      )}

      <Phase2Detail phase2={a.phase2} solved={a.solved} inProgress={a.in_progress} />

      {(a.in_progress || (a.solved && !a.phase2.submitted)) && (
        <Link href="/play" className="pill-primary mt-5 inline-block">
          {a.in_progress ? "Continue this game →" : "Finish Phase 2 →"}
        </Link>
      )}
    </div>
  );
}

function Phase2Detail({
  phase2, solved, inProgress,
}: { phase2: Phase2; solved: boolean; inProgress: boolean }) {
  if (inProgress || !solved) return null;

  if (phase2.submitted) {
    return (
      <div className="mt-5 border-t border-bg-border pt-5">
        <div className="text-xs uppercase tracking-widest text-accent">Phase 2 — submitted</div>
        <p className="mt-2 text-sm text-white/70">
          Matched <span className="font-mono font-bold text-accent">{phase2.correct_count}</span>{" "}
          target word{phase2.correct_count === 1 ? "" : "s"}
          {phase2.sentence_approved && (
            <span className="ml-2 rounded-full bg-accent/20 px-2 py-0.5 text-xs text-accent">
              ✓ sentence bonus
            </span>
          )}
        </p>
        {phase2.words && phase2.words.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {phase2.words.map((w, i) => (
              <span key={i} className="rounded-full bg-accent/15 px-3 py-1 text-sm text-accent">
                {w}
              </span>
            ))}
          </div>
        )}
        {phase2.sentence && (
          <p className="mt-3 rounded-2xl border border-bg-border bg-bg-soft p-4 text-sm italic text-white/80">
            “{phase2.sentence}”
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-5 border-t border-bg-border pt-5">
      <div className="text-xs uppercase tracking-widest text-amber-300/80">
        Phase 2 — not submitted
      </div>
      {phase2.draft ? (
        <p className="mt-2 text-sm text-white/60">
          You have a saved draft ({phase2.draft.words.length} word
          {phase2.draft.words.length === 1 ? "" : "s"}) waiting. Nothing is scored until
          you submit it.
        </p>
      ) : (
        <p className="mt-2 text-sm text-white/60">
          You solved the Wordle — Phase 2 points are still available.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-widest text-white/50">{label}</div>
      <div className="mt-0.5 font-mono text-white/90">{value}</div>
    </div>
  );
}

function StatusBadge({ attempt: a }: { attempt: Attempt }) {
  if (a.in_progress) {
    return (
      <span className="rounded-full bg-amber-400/15 px-3 py-1 text-xs text-amber-300">
        In progress
      </span>
    );
  }
  if (a.solved) {
    return (
      <span className="rounded-full bg-accent/20 px-3 py-1 text-xs text-accent">Solved</span>
    );
  }
  return (
    <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-white/50">
      {a.expired ? "Time up" : "Not solved"}
    </span>
  );
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}
