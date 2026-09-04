import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";
import { playerOwnsAttempt } from "@/lib/identity";
import { loadLiveAttempt } from "@/lib/attempt";
import { validateSentence, validateWords } from "@/lib/phase2";

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

// ---------------------------------------------------------------------------
// POST /api/phase2/draft
// Save Phase 2 work-in-progress. Nothing here is scored and nothing reaches
// the leaderboard — the draft lives in its own columns until the player hits
// "Submit final". This is what lets someone close the browser mid-Phase-2 and
// pick up exactly where they left off.
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const attemptId = String(body.attempt_id || "");
    if (!attemptId) return json({ error: "attempt_id required" }, 400);

    // Drafts are validated loosely — incomplete is the whole point — but the
    // size caps still apply so a draft can't be used to dump data.
    const words = validateWords(body.words, false);
    if (!words.ok) return json({ error: words.error }, 400);
    const sentence = validateSentence(body.sentence, false);
    if (!sentence.ok) return json({ error: sentence.error }, 400);

    const sb = supabaseAdmin();
    const att = await loadLiveAttempt(sb, attemptId);
    if (!att) return json({ error: "Attempt not found" }, 404);

    const { userId } = await auth();
    if (!(await playerOwnsAttempt(sb, att.player_id, userId))) {
      return json({ error: "That game belongs to another account" }, 403);
    }

    if (!att.finished_at) return json({ error: "Wordle not finished" }, 409);
    if (!att.solved) return json({ error: "Phase 2 requires a solved wordle" }, 403);
    if (att.phase2_finished_at) {
      return json({ error: "Phase 2 already submitted — drafts are locked" }, 409);
    }

    const savedAt = new Date().toISOString();
    const { error: updErr } = await sb
      .from("attempts")
      .update({
        phase2_draft_words: words.value,
        phase2_draft_sentence: sentence.value,
        phase2_draft_updated_at: savedAt,
      })
      .eq("id", attemptId)
      // Never overwrite a draft after the final submit has landed.
      .is("phase2_finished_at", null);

    if (updErr) return json({ error: updErr.message }, 500);

    return json({ saved: true, saved_at: savedAt, words: words.value, sentence: sentence.value });
  } catch (e: any) {
    return json({ error: e?.message || "Server error" }, 500);
  }
}
