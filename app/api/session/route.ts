import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";
import { playerOwnsAttempt, resolvePlayer } from "@/lib/identity";
import {
  ATTEMPT_COLUMNS,
  AttemptRow,
  finalizeIfExpired,
  loadLiveAttempt,
  publicAttemptState,
} from "@/lib/attempt";

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

async function getConfig(sb: ReturnType<typeof supabaseAdmin>) {
  const { data, error } = await sb.from("game_config").select("*").eq("id", 1).single();
  if (error || !data) return null;
  return data;
}

// ---------------------------------------------------------------------------
// GET /api/session?attempt_id=<uuid>
// Resume an attempt. The browser stores attempt_id and calls this on load, so
// reopening the tab restores the board (and any Phase 2 draft) instead of
// showing an empty grid or starting a second game.
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  try {
    const attemptId = req.nextUrl.searchParams.get("attempt_id");
    if (!attemptId) return json({ error: "attempt_id required" }, 400);

    const sb = supabaseAdmin();
    const cfg = await getConfig(sb);
    if (!cfg) return json({ error: "Config missing" }, 500);

    const att = await loadLiveAttempt(sb, attemptId);
    if (!att) return json({ error: "Attempt not found" }, 404);

    const { userId } = await auth();
    if (!(await playerOwnsAttempt(sb, att.player_id, userId))) {
      return json({ error: "That game belongs to another account" }, 403);
    }

    return json({ ...publicAttemptState(att, cfg), name: att.name, roll_number: att.roll_number });
  } catch (e: any) {
    return json({ error: e?.message || "Server error" }, 500);
  }
}

// ---------------------------------------------------------------------------
// POST /api/session
// Start a game — or hand back the one this player already has. A player has at
// most one attempt, so a double-tap on "Start", a second tab, or a reload can
// never produce a second board.
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = String(body.name || "").trim();
    const roll = String(body.roll_number || "").trim().toUpperCase();

    if (!name || !roll) {
      return json({ error: "Name and roll number required" }, 400);
    }
    if (name.length > 60 || roll.length > 40) {
      return json({ error: "Name or roll number too long" }, 400);
    }

    const sb = supabaseAdmin();
    const cfg = await getConfig(sb);
    if (!cfg) return json({ error: "Config missing" }, 500);

    const words: string[] = (cfg.words || []).filter((w: string) => w?.length === 5);
    if (words.length === 0) {
      return json({ error: "No words configured" }, 500);
    }

    // Identity comes from the signed-in Clerk account; the form fields are
    // just profile data hung off it.
    const { userId } = await auth();
    const resolved = await resolvePlayer(sb, { name, roll, clerkUserId: userId });
    if (!resolved.ok) return json({ error: resolved.error }, resolved.status);
    const player = resolved.player;

    // Already has an attempt? Resume it — finished or not. This is what makes
    // "close the browser, come back, carry on with Phase 2" work, and it stops
    // players from replaying to farm an easier word.
    const existing = await findAttempt(sb, player.id);
    if (existing) {
      return json(publicAttemptState(await finalizeIfExpired(sb, existing), cfg));
    }

    // Only a brand-new game is gated on the game being open. Closing the game
    // freezes registration; players already mid-attempt (or mid-Phase-2) keep
    // going, which is what the admin console's OPEN/CLOSED switch promises.
    if (!cfg.is_open) {
      return json({ error: "Game is currently closed" }, 403);
    }

    const word = words[Math.floor(Math.random() * words.length)].toUpperCase();
    const startedAt = new Date();
    const deadlineAt =
      cfg.mode === "timed"
        ? new Date(startedAt.getTime() + (cfg.time_limit_seconds || 300) * 1000)
        : null;

    const { data: created, error: insErr } = await sb
      .from("attempts")
      .insert({
        player_id: player.id,
        name: player.name,
        roll_number: player.roll_number,
        word,
        mode: cfg.mode,
        started_at: startedAt.toISOString(),
        deadline_at: deadlineAt ? deadlineAt.toISOString() : null,
      })
      .select(ATTEMPT_COLUMNS)
      .maybeSingle();

    if (created) {
      return json(publicAttemptState(created as unknown as AttemptRow, cfg));
    }

    // Lost a race against a concurrent start: the partial unique index
    // (attempts_one_open_per_player) rejected the duplicate. Hand back the
    // attempt that won instead of erroring at the player.
    if ((insErr as any)?.code === "23505") {
      const won = await findAttempt(sb, player.id);
      if (won) return json(publicAttemptState(won, cfg));
    }

    return json({ error: insErr?.message || "Failed to start" }, 500);
  } catch (e: any) {
    return json({ error: e?.message || "Server error" }, 500);
  }
}

// The player's attempt: prefer an open one, otherwise the most recent.
// Ordered + limited rather than .single()/.maybeSingle(), which ERROR on
// multiple rows — the old code discarded that error and treated it as "no
// attempt", which is what made duplicates multiply on every reload.
async function findAttempt(
  sb: ReturnType<typeof supabaseAdmin>,
  playerId: string
): Promise<AttemptRow | null> {
  const { data } = await sb
    .from("attempts")
    .select(ATTEMPT_COLUMNS)
    .eq("player_id", playerId)
    .order("finished_at", { ascending: true, nullsFirst: true })
    .order("started_at", { ascending: false })
    .limit(1);
  const row = data?.[0];
  return row ? (row as unknown as AttemptRow) : null;
}
