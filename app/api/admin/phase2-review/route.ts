import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { checkAdmin } from "@/lib/adminAuth";
import { PHASE2_LIMITS, getMetaForWord, sentenceExactMatches } from "@/lib/phase2";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

// PATCH /api/admin/phase2-review
// Body: { attempt_id, approved: boolean }
// Awards or removes the sentence bonus. Preserves the exact-match bonus.
export async function PATCH(req: NextRequest) {
  if (!checkAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { attempt_id, approved } = await req.json();
  if (!attempt_id || typeof approved !== "boolean") {
    return NextResponse.json({ error: "attempt_id and approved (boolean) required" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data: att, error } = await sb
    .from("attempts")
    .select("id, word, phase2_correct_count, phase2_sentence, phase2_finished_at")
    .eq("id", attempt_id)
    .single();
  if (error || !att) return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
  if (!att.phase2_finished_at) return NextResponse.json({ error: "Phase 2 not submitted" }, { status: 409 });

  // Recompute exact-match so a manual approve/reject can't wipe out an
  // exact-sentence bonus the player legitimately earned.
  const { data: cfg } = await sb.from("game_config").select("word_meta").eq("id", 1).single();
  const meta = getMetaForWord(cfg?.word_meta || {}, att.word);
  const targetSentence = typeof meta.target_sentence === "string" ? meta.target_sentence : "";
  const exactMatch = targetSentence && att.phase2_sentence
    ? sentenceExactMatches(att.phase2_sentence, targetSentence)
    : false;

  const wordPoints = (att.phase2_correct_count || 0) * PHASE2_LIMITS.POINTS_PER_TARGET_WORD;
  const bonusPoints =
    (approved ? PHASE2_LIMITS.SENTENCE_THRESHOLD_BONUS : 0) +
    (exactMatch ? PHASE2_LIMITS.EXACT_MATCH_BONUS : 0);
  const newScore = wordPoints + bonusPoints;

  const { error: updErr } = await sb.from("attempts").update({
    phase2_sentence_approved: approved,
    phase2_score: newScore,
  }).eq("id", attempt_id);

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, phase2_score: newScore, approved });
}
