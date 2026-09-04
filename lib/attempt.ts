// Shared attempt helpers used by /api/session, /api/guess and /api/phase2/*.
//
// Everything that needs to know "what is the true state of this attempt right
// now" goes through here, so the deadline rule and the shape of the state we
// send to the browser are defined in exactly one place.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LetterStatus } from "./wordlist";

export type GuessRow = { word: string; status: LetterStatus[] };

export type AttemptRow = {
  id: string;
  player_id: string;
  name: string;
  roll_number: string;
  word: string;
  guesses: GuessRow[] | null;
  guess_count: number;
  solved: boolean;
  duration_ms: number;
  score: number;
  mode: string;
  started_at: string;
  finished_at: string | null;
  deadline_at: string | null;
  expired: boolean;
  phase2_words: string[] | null;
  phase2_sentence: string | null;
  phase2_score: number;
  phase2_finished_at: string | null;
  phase2_draft_words: string[] | null;
  phase2_draft_sentence: string | null;
  phase2_draft_updated_at: string | null;
};

// Every column the game logic needs. Kept explicit rather than "*" so a
// schema change shows up as a type error instead of silently going missing.
export const ATTEMPT_COLUMNS =
  "id, player_id, name, roll_number, word, guesses, guess_count, solved, " +
  "duration_ms, score, mode, started_at, finished_at, deadline_at, expired, " +
  "phase2_words, phase2_sentence, phase2_score, phase2_finished_at, " +
  "phase2_draft_words, phase2_draft_sentence, phase2_draft_updated_at";

export function isPastDeadline(att: AttemptRow, now = Date.now()): boolean {
  if (att.finished_at) return false;
  if (!att.deadline_at) return false;
  return now >= new Date(att.deadline_at).getTime();
}

// Close an attempt whose clock has run out. Called on every read path, so a
// player who closes the tab mid-game still gets a correctly-closed attempt the
// next time anyone touches it — the old client-only timeout left the row open
// forever, which kept it off the leaderboard AND let the player resume later.
//
// The `is("finished_at", null)` guard makes this safe to run concurrently:
// whoever gets there first wins, everyone else no-ops.
export async function finalizeIfExpired(
  sb: SupabaseClient,
  att: AttemptRow
): Promise<AttemptRow> {
  if (!isPastDeadline(att)) return att;

  const deadline = new Date(att.deadline_at as string);
  const patch = {
    finished_at: deadline.toISOString(),
    expired: true,
    solved: false,
    score: 0,
    duration_ms: Math.max(
      0,
      deadline.getTime() - new Date(att.started_at).getTime()
    ),
  };

  await sb
    .from("attempts")
    .update(patch)
    .eq("id", att.id)
    .is("finished_at", null);

  return { ...att, ...patch };
}

export async function loadAttempt(
  sb: SupabaseClient,
  attemptId: string
): Promise<AttemptRow | null> {
  const { data, error } = await sb
    .from("attempts")
    .select(ATTEMPT_COLUMNS)
    .eq("id", attemptId)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as AttemptRow;
}

// Load + auto-close if the clock ran out. This is what routes should use.
export async function loadLiveAttempt(
  sb: SupabaseClient,
  attemptId: string
): Promise<AttemptRow | null> {
  const att = await loadAttempt(sb, attemptId);
  if (!att) return null;
  return finalizeIfExpired(sb, att);
}

export function secondsLeft(att: AttemptRow, now = Date.now()): number | null {
  if (!att.deadline_at) return null;
  return Math.max(0, Math.ceil((new Date(att.deadline_at).getTime() - now) / 1000));
}

export type PublicAttemptState = {
  attempt_id: string;
  mode: string;
  max_guesses: number;
  time_limit_seconds: number;
  guesses: GuessRow[];
  guess_count: number;
  finished: boolean;
  solved: boolean;
  expired: boolean;
  score: number | null;
  answer: string | null;
  seconds_left: number | null;
  elapsed_seconds: number;
  phase2_final: boolean;
  phase2_draft: { words: string[]; sentence: string } | null;
};

// The single definition of what the browser is allowed to know. The answer is
// only ever included once the attempt is over.
export function publicAttemptState(
  att: AttemptRow,
  cfg: { max_guesses: number; time_limit_seconds: number }
): PublicAttemptState {
  const finished = !!att.finished_at;
  return {
    attempt_id: att.id,
    mode: att.mode,
    max_guesses: cfg.max_guesses,
    time_limit_seconds: cfg.time_limit_seconds,
    guesses: att.guesses || [],
    guess_count: att.guess_count,
    finished,
    solved: att.solved,
    expired: att.expired,
    score: finished ? att.score : null,
    answer: finished ? att.word : null,
    seconds_left: secondsLeft(att),
    // So a resumed board shows the real elapsed time instead of restarting
    // its clock from zero.
    elapsed_seconds: Math.max(
      0,
      Math.floor(
        ((finished ? new Date(att.finished_at as string).getTime() : Date.now()) -
          new Date(att.started_at).getTime()) / 1000
      )
    ),
    phase2_final: !!att.phase2_finished_at,
    phase2_draft:
      att.phase2_draft_words || att.phase2_draft_sentence
        ? {
            words: att.phase2_draft_words || [],
            sentence: att.phase2_draft_sentence || "",
          }
        : null,
  };
}
