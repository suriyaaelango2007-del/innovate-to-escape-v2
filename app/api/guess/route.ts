import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";
import { playerOwnsAttempt } from "@/lib/identity";
import { computeScore, evaluateGuess, isValidGuess } from "@/lib/wordlist";
import { GuessRow, loadLiveAttempt, secondsLeft } from "@/lib/attempt";

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

// Submit a single guess. The server evaluates against the stored answer,
// persists the guess, and returns the per-letter statuses.
export async function POST(req: NextRequest) {
  try {
    const { attempt_id, guess } = await req.json();
    if (!attempt_id || typeof guess !== "string") {
      return json({ error: "Missing attempt_id or guess" }, 400);
    }
    const g = guess.trim().toUpperCase();
    if (!/^[A-Z]{5}$/.test(g)) {
      return json({ error: g.length === 5 ? "Letters only" : "Guess must be 5 letters" }, 400);
    }

    const sb = supabaseAdmin();

    // loadLiveAttempt closes the attempt first if its clock has run out, so an
    // expired game can't accept another guess.
    const att = await loadLiveAttempt(sb, attempt_id);
    if (!att) return json({ error: "Attempt not found" }, 404);

    const { userId } = await auth();
    if (!(await playerOwnsAttempt(sb, att.player_id, userId))) {
      return json({ error: "That game belongs to another account" }, 403);
    }

    if (att.finished_at) {
      return json(
        {
          error: att.expired ? "Time's up — this game is over" : "Game already finished",
          finished: true,
          solved: att.solved,
          expired: att.expired,
          answer: att.word,
          score: att.score,
          guess_count: att.guess_count,
        },
        409
      );
    }

    const { data: cfg } = await sb.from("game_config").select("max_guesses").eq("id", 1).single();
    const maxGuesses = cfg?.max_guesses ?? 6;

    if (att.guess_count >= maxGuesses) {
      return json({ error: "No guesses left" }, 409);
    }

    // The answer is always accepted, even if an admin configured a word that
    // isn't in the dictionary.
    if (g !== att.word.toUpperCase() && !isValidGuess(g)) {
      return json({ error: "Not a real word" }, 400);
    }

    const status = evaluateGuess(g, att.word);
    const solved = status.every((s) => s === "correct");
    const newGuesses: GuessRow[] = [...(att.guesses || []), { word: g, status }];
    const newCount = att.guess_count + 1;
    const outOfGuesses = newCount >= maxGuesses;

    let finishedAt: string | null = null;
    let durationMs = att.duration_ms;
    let score = 0;

    if (solved || outOfGuesses) {
      finishedAt = new Date().toISOString();
      durationMs = Date.now() - new Date(att.started_at).getTime();
      score = computeScore({ solved, guessCount: newCount, maxGuesses, durationMs });
    }

    // Compare-and-swap on guess_count. Two requests that both read guess_count
    // = N used to both write N+1, losing one guess entirely; now the second
    // one matches no rows and is reported as a conflict instead.
    const { data: updated, error: updErr } = await sb
      .from("attempts")
      .update({
        guesses: newGuesses,
        guess_count: newCount,
        solved,
        finished_at: finishedAt,
        duration_ms: durationMs,
        score,
      })
      .eq("id", attempt_id)
      .eq("guess_count", att.guess_count)
      .is("finished_at", null)
      .select("id");

    if (updErr) return json({ error: updErr.message }, 500);

    if (!updated || updated.length === 0) {
      // Someone else advanced this attempt between our read and our write —
      // a double-tapped Enter, a retried request, or a second tab. Tell the
      // client to resync rather than silently dropping or double-counting.
      const fresh = await loadLiveAttempt(sb, attempt_id);
      return json(
        {
          error: "That guess was already counted — resyncing your board",
          conflict: true,
          guesses: fresh?.guesses || [],
          guess_count: fresh?.guess_count ?? att.guess_count,
          finished: !!fresh?.finished_at,
          solved: !!fresh?.solved,
          answer: fresh?.finished_at ? fresh.word : null,
          score: fresh?.finished_at ? fresh.score : null,
        },
        409
      );
    }

    return json({
      status,
      solved,
      guess_count: newCount,
      finished: !!finishedAt,
      // Reveal the answer only when the game ends
      answer: finishedAt ? att.word : null,
      score: finishedAt ? score : null,
      seconds_left: secondsLeft(att),
    });
  } catch (e: any) {
    return json({ error: e?.message || "Server error" }, 500);
  }
}
