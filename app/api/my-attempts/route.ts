import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";
import { findPlayerByClerkId } from "@/lib/identity";
import { AttemptRow, finalizeIfExpired, GuessRow } from "@/lib/attempt";
import { rankedLeaderboard } from "@/lib/leaderboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const NO_STORE = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
};

function json(body: unknown, status = 200) {
  return new NextResponse(JSON.stringify(body), { status, headers: NO_STORE });
}

// Everything the history page shows. Wider than ATTEMPT_COLUMNS because it also
// needs the Phase 2 review fields.
const HISTORY_COLUMNS =
  "id, player_id, name, roll_number, word, guesses, guess_count, solved, " +
  "duration_ms, score, mode, started_at, finished_at, deadline_at, expired, " +
  "phase2_words, phase2_correct_count, phase2_sentence, phase2_sentence_approved, " +
  "phase2_score, phase2_finished_at, phase2_draft_words, phase2_draft_sentence, " +
  "phase2_draft_updated_at";

type HistoryRow = AttemptRow & {
  phase2_correct_count: number;
  phase2_sentence_approved: boolean;
};

// ---------------------------------------------------------------------------
// GET /api/my-attempts
// Every game the signed-in player has played, newest first, with the full
// result of each. Their own history — so the answer and their Phase 2
// submission are theirs to see, but only once the game is actually over.
// ---------------------------------------------------------------------------
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return json({ error: "Sign in to see your games" }, 401);

    const sb = supabaseAdmin();

    const player = await findPlayerByClerkId(sb, userId);
    if (!player) {
      // Signed in but never registered a game yet.
      return json({ player: null, attempts: [], summary: emptySummary() });
    }

    const { data, error } = await sb
      .from("attempts")
      .select(HISTORY_COLUMNS)
      .eq("player_id", player.id)
      .order("started_at", { ascending: true })
      .limit(100);

    if (error) return json({ error: error.message }, 500);

    const { data: cfg } = await sb
      .from("game_config").select("max_guesses").eq("id", 1).single();
    const maxGuesses = cfg?.max_guesses ?? 6;

    // Close out anything whose clock ran out while they were away, so the
    // history never shows a stale "in progress" game.
    const rows: HistoryRow[] = [];
    for (const raw of (data ?? []) as unknown as HistoryRow[]) {
      const live = (await finalizeIfExpired(sb, raw)) as HistoryRow;
      rows.push(live);
    }

    // Attempt #1 is their first game chronologically; the list is then shown
    // newest-first so the most recent result is at the top.
    const attempts = rows.map((r, i) => toPublic(r, i + 1, maxGuesses)).reverse();

    // Where their best finished game sits on the live board.
    let leaderboardRank: number | null = null;
    let leaderboardSize = 0;
    if (rows.some((r) => r.finished_at)) {
      const { rows: board } = await rankedLeaderboard(sb);
      leaderboardSize = board.length;
      const idx = board.findIndex((b) => b.player_id === player.id);
      if (idx >= 0) leaderboardRank = idx + 1;
    }

    const finished = attempts.filter((a) => !a.in_progress);
    const best = finished.reduce<number>((m, a) => Math.max(m, a.total_score), 0);

    return json({
      player: { name: player.name, roll_number: player.roll_number },
      attempts,
      summary: {
        total_attempts: attempts.length,
        finished: finished.length,
        solved: finished.filter((a) => a.solved).length,
        best_total: best,
        leaderboard_rank: leaderboardRank,
        leaderboard_size: leaderboardSize,
      },
    });
  } catch (e: any) {
    return json({ error: e?.message || "Server error" }, 500);
  }
}

function emptySummary() {
  return {
    total_attempts: 0,
    finished: 0,
    solved: 0,
    best_total: 0,
    leaderboard_rank: null,
    leaderboard_size: 0,
  };
}

function toPublic(r: HistoryRow, attemptNumber: number, maxGuesses: number) {
  const inProgress = !r.finished_at;
  const phase2Final = !!r.phase2_finished_at;

  return {
    id: r.id,
    attempt_number: attemptNumber,
    mode: r.mode,
    started_at: r.started_at,
    finished_at: r.finished_at,
    in_progress: inProgress,
    solved: r.solved,
    expired: r.expired,
    // Never reveal the answer to a game they could still be playing.
    word: inProgress ? null : r.word,
    guesses: (r.guesses || []) as GuessRow[],
    guess_count: r.guess_count,
    max_guesses: maxGuesses,
    duration_ms: r.duration_ms,
    score: inProgress ? null : r.score,
    phase2: {
      submitted: phase2Final,
      submitted_at: r.phase2_finished_at,
      words: phase2Final ? r.phase2_words || [] : null,
      sentence: phase2Final ? r.phase2_sentence : null,
      correct_count: phase2Final ? r.phase2_correct_count : null,
      sentence_approved: phase2Final ? r.phase2_sentence_approved : null,
      score: phase2Final ? r.phase2_score : 0,
      // An unsubmitted draft is shown so they can see there's unfinished work
      // waiting for them.
      draft:
        !phase2Final && (r.phase2_draft_words?.length || r.phase2_draft_sentence)
          ? {
              words: r.phase2_draft_words || [],
              sentence: r.phase2_draft_sentence || "",
              saved_at: r.phase2_draft_updated_at,
            }
          : null,
    },
    total_score: inProgress ? 0 : (r.score || 0) + (phase2Final ? r.phase2_score || 0 : 0),
  };
}
