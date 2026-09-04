import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";
import { playerOwnsAttempt } from "@/lib/identity";
import { loadLiveAttempt } from "@/lib/attempt";
import {
  PHASE2_LIMITS, getMetaForWord, scoreWords,
  sentenceQualifiesForBonus, sentenceExactMatches,
  validateSentence, validateWords,
} from "@/lib/phase2";

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

// Score a submission. Pure — used both for a fresh submit and for replaying an
// already-final submission back to the player.
function scoreSubmission(words: string[], sentence: string, meta: any) {
  const targets: string[] = Array.isArray(meta.target_words) ? meta.target_words : [];
  const targetSentence: string =
    typeof meta.target_sentence === "string" ? meta.target_sentence : "";

  const correctCount = scoreWords(words, targets);
  const sentenceCheck = sentenceQualifiesForBonus(sentence, targets);
  const exactMatch = targetSentence ? sentenceExactMatches(sentence, targetSentence) : false;

  const phase2Score =
    correctCount * PHASE2_LIMITS.POINTS_PER_TARGET_WORD +
    (sentenceCheck.qualifies ? PHASE2_LIMITS.SENTENCE_THRESHOLD_BONUS : 0) +
    (exactMatch ? PHASE2_LIMITS.EXACT_MATCH_BONUS : 0);

  return {
    correct_count: correctCount,
    target_count: targets.length,
    phase2_score: phase2Score,
    sentence_approved: sentenceCheck.qualifies,
    sentence_target_hits: sentenceCheck.hits,
    sentence_target_required:
      sentenceCheck.required === Infinity ? null : sentenceCheck.required,
    sentence_word_count: sentenceCheck.wordCount,
    exact_match: exactMatch,
    exact_match_bonus: exactMatch ? PHASE2_LIMITS.EXACT_MATCH_BONUS : 0,
    exact_match_available: !!targetSentence,
  };
}

// ---------------------------------------------------------------------------
// POST /api/phase2/submit
// The FINAL submission. Scores the answer and locks Phase 2. Everything before
// this is a draft (POST /api/phase2/draft) and stays editable.
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const attemptId = String(body.attempt_id || "");
    if (!attemptId) return json({ error: "attempt_id required" }, 400);

    // Explicit opt-in, so a stray request can't accidentally end someone's
    // Phase 2 while they're still editing.
    if (body.final !== true) {
      return json(
        { error: "Final submissions must set final:true. Use /api/phase2/draft to save progress." },
        400
      );
    }

    const words = validateWords(body.words, true);
    if (!words.ok) return json({ error: words.error }, 400);
    const sentence = validateSentence(body.sentence, true);
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

    const { data: cfg } = await sb
      .from("game_config").select("word_meta, phase2_enabled").eq("id", 1).single();
    if (!cfg?.phase2_enabled) return json({ error: "Phase 2 disabled" }, 403);

    const meta = getMetaForWord(cfg.word_meta || {}, att.word);

    // Already final: replay the stored result instead of erroring. A retried
    // request or a double-tapped button then shows the same score rather than
    // a scary "already submitted" failure.
    if (att.phase2_finished_at) {
      return json({
        ...scoreSubmission(att.phase2_words || [], att.phase2_sentence || "", meta),
        phase2_score: att.phase2_score,
        already_final: true,
      });
    }

    const result = scoreSubmission(words.value, sentence.value, meta);

    const { data: updated, error: updErr } = await sb
      .from("attempts")
      .update({
        phase2_words: words.value,
        phase2_correct_count: result.correct_count,
        phase2_sentence: sentence.value,
        phase2_sentence_approved: result.sentence_approved,
        phase2_score: result.phase2_score,
        phase2_finished_at: new Date().toISOString(),
        // The draft has served its purpose; clear it so the admin views show
        // only what was actually submitted.
        phase2_draft_words: null,
        phase2_draft_sentence: null,
        phase2_draft_updated_at: null,
      })
      .eq("id", attemptId)
      // Only the first final submission wins.
      .is("phase2_finished_at", null)
      .select("id");

    if (updErr) return json({ error: updErr.message }, 500);

    if (!updated || updated.length === 0) {
      // A concurrent request submitted first — return that one's result.
      const fresh = await loadLiveAttempt(sb, attemptId);
      return json({
        ...scoreSubmission(fresh?.phase2_words || [], fresh?.phase2_sentence || "", meta),
        phase2_score: fresh?.phase2_score ?? 0,
        already_final: true,
      });
    }

    return json({ ...result, already_final: false });
  } catch (e: any) {
    return json({ error: e?.message || "Server error" }, 500);
  }
}
