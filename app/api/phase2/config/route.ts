import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";
import { playerOwnsAttempt } from "@/lib/identity";
import { safeWikiUrl, getMetaForWord } from "@/lib/phase2";
import { loadLiveAttempt } from "@/lib/attempt";

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

// GET /api/phase2/config?attempt_id=<uuid>
// Only exposed after the wordle is finished AND solved.
// Reveals the Wikipedia URL + number of target words (NOT the actual words),
// plus any saved draft so a returning player resumes mid-edit.
export async function GET(req: NextRequest) {
  const attemptId = req.nextUrl.searchParams.get("attempt_id");
  if (!attemptId) return json({ error: "attempt_id required" }, 400);

  const sb = supabaseAdmin();
  const att = await loadLiveAttempt(sb, attemptId);
  if (!att) return json({ error: "Attempt not found" }, 404);

  const { userId } = await auth();
  if (!(await playerOwnsAttempt(sb, att.player_id, userId))) {
    return json({ error: "That game belongs to another account" }, 403);
  }

  if (!att.finished_at) return json({ error: "Wordle not finished" }, 409);
  if (!att.solved) return json({ error: "Phase 2 requires a solved wordle" }, 403);

  const { data: cfg } = await sb.from("game_config").select("*").eq("id", 1).single();
  if (!cfg?.phase2_enabled) {
    return json({ enabled: false });
  }

  const meta = getMetaForWord(cfg.word_meta || {}, att.word);
  const targets = Array.isArray(meta.target_words) ? meta.target_words : [];

  return json({
    enabled: true,
    word: att.word,
    wiki_url: safeWikiUrl(meta.url, att.word),
    target_word_count: targets.length,
    // Renamed from `already_submitted`: this now means "finally submitted and
    // locked", as opposed to having an editable draft saved.
    already_submitted: !!att.phase2_finished_at,
    is_final: !!att.phase2_finished_at,
    // Restore point for a player who left mid-Phase-2.
    draft: {
      words: att.phase2_draft_words || [],
      sentence: att.phase2_draft_sentence || "",
      saved_at: att.phase2_draft_updated_at,
    },
    // Populated only once locked, so the player can see what they submitted.
    submitted: att.phase2_finished_at
      ? {
          words: att.phase2_words || [],
          sentence: att.phase2_sentence || "",
          score: att.phase2_score,
        }
      : null,
  });
}
