// Leaderboard ranking, shared by /api/leaderboard and /api/my-attempts so a
// player's "you're 4th" can never disagree with the board on the projector.

import type { SupabaseClient } from "@supabase/supabase-js";

export const LEADERBOARD_COLUMNS =
  "id, player_id, name, roll_number, guess_count, solved, duration_ms, score, " +
  "phase2_score, phase2_sentence_approved, phase2_finished_at, finished_at";

export type LeaderboardRow = {
  id: string;
  player_id: string;
  name: string;
  roll_number: string;
  guess_count: number;
  solved: boolean;
  duration_ms: number;
  score: number;
  phase2_score: number;
  phase2_sentence_approved: boolean;
  phase2_finished_at: string | null;
  finished_at: string;
  total_score: number;
};

/**
 * Solved first, then highest total, then fastest. Returns <0 when `a` ranks
 * above `b`, so it doubles as both a comparator and an "is a better?" test.
 */
export function rank(a: LeaderboardRow, b: LeaderboardRow): number {
  if (a.solved !== b.solved) return a.solved ? -1 : 1;
  if (a.total_score !== b.total_score) return b.total_score - a.total_score;
  return a.duration_ms - b.duration_ms;
}

function withTotal(r: any): LeaderboardRow {
  return {
    ...r,
    phase2_score: r.phase2_score || 0,
    // Only a FINAL Phase 2 submission counts. Drafts live in separate columns
    // and are never scored, but this stays as a belt-and-braces guard.
    total_score: (r.score || 0) + (r.phase2_finished_at ? r.phase2_score || 0 : 0),
  };
}

/**
 * Every finished attempt, reduced to one row per player (their best) and
 * sorted. Historically a player could accumulate several attempts, which
 * filled the board with duplicates of the same person.
 */
export async function rankedLeaderboard(
  sb: SupabaseClient
): Promise<{ rows: LeaderboardRow[]; error: string | null }> {
  const { data, error } = await sb
    .from("attempts")
    .select(LEADERBOARD_COLUMNS)
    .not("finished_at", "is", null)
    .limit(2000);

  if (error) return { rows: [], error: error.message };

  const best = new Map<string, LeaderboardRow>();
  for (const raw of data ?? []) {
    const row = withTotal(raw);
    const key = row.player_id || `roll:${row.roll_number}`;
    const current = best.get(key);
    if (!current || rank(row, current) < 0) best.set(key, row);
  }

  return { rows: Array.from(best.values()).sort(rank), error: null };
}
