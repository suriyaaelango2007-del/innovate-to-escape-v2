// Who is playing?
//
// Identity is the signed-in Clerk user. The roll number is still collected
// (organisers rank by it) but it is no longer what identifies a player, which
// is what let two people with the same roll number overwrite each other.
//
// The pre-Clerk paths below are kept deliberately: players who registered
// before Clerk have no clerk_user_id, and they get bound to an account the
// first time they sign in rather than being locked out mid-event.

import type { SupabaseClient } from "@supabase/supabase-js";

export type PlayerIdentity = {
  name: string;
  roll: string;
  /** Set once Clerk is wired up; null pre-Clerk. */
  clerkUserId?: string | null;
};

export type PlayerRow = {
  id: string;
  name: string;
  roll_number: string;
  clerk_user_id: string | null;
};

export type ResolveResult =
  | { ok: true; player: PlayerRow }
  | { ok: false; error: string; status: number };

const PLAYER_COLUMNS = "id, name, roll_number, clerk_user_id";

/** The player row for a signed-in account, or null if they've never played. */
export async function findPlayerByClerkId(
  sb: SupabaseClient,
  clerkUserId: string
): Promise<PlayerRow | null> {
  const { data } = await sb
    .from("players")
    .select(PLAYER_COLUMNS)
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();
  return (data as PlayerRow) || null;
}

/**
 * Is this attempt the signed-in user's to act on?
 *
 * Before Clerk, holding an attempt_id was the only credential — anyone who
 * learned someone else's id could submit guesses as them. Now the attempt is
 * tied to the account that owns the player row.
 *
 * Players registered before Clerk have no clerk_user_id yet; those keep the
 * old attempt_id-as-credential behaviour so an event already in progress
 * doesn't lock everyone out mid-game. They get bound to an account the next
 * time they sign in and hit /api/session.
 */
export async function playerOwnsAttempt(
  sb: SupabaseClient,
  playerId: string,
  clerkUserId: string | null
): Promise<boolean> {
  const { data } = await sb
    .from("players")
    .select("clerk_user_id")
    .eq("id", playerId)
    .maybeSingle();
  if (!data) return false;
  if (!data.clerk_user_id) return true; // legacy, pre-Clerk player
  return data.clerk_user_id === clerkUserId;
}

/** Loose name comparison so "  priya  kumar" and "Priya Kumar" are the same person. */
function sameName(a: string, b: string): boolean {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  return norm(a) === norm(b);
}

function firstNameOf(full: string): string {
  return full.trim().split(/\s+/)[0] || "someone else";
}

export async function resolvePlayer(
  sb: SupabaseClient,
  ident: PlayerIdentity,
  retriesLeft = 1
): Promise<ResolveResult> {
  const clerkUserId = ident.clerkUserId || null;

  // 1. Signed-in user we already know — identity is settled, roll/name in the
  //    request cannot change it.
  if (clerkUserId) {
    const { data: byClerk } = await sb
      .from("players")
      .select(PLAYER_COLUMNS)
      .eq("clerk_user_id", clerkUserId)
      .maybeSingle();
    if (byClerk) return { ok: true, player: byClerk as PlayerRow };
  }

  // 2. Existing player with this roll number.
  const { data: byRoll } = await sb
    .from("players")
    .select(PLAYER_COLUMNS)
    .eq("roll_number", ident.roll)
    .maybeSingle();

  if (byRoll) {
    const row = byRoll as PlayerRow;

    // Someone else's Clerk account already owns this roll number.
    if (row.clerk_user_id && clerkUserId && row.clerk_user_id !== clerkUserId) {
      return {
        ok: false,
        status: 409,
        error: "That roll number is already registered to another account.",
      };
    }

    // Pre-Clerk: the name must match. The old code upserted on roll_number,
    // which silently OVERWROTE the existing player's name and handed their
    // record to whoever typed the roll number second. Refuse instead.
    if (!clerkUserId && !sameName(row.name, ident.name)) {
      return {
        ok: false,
        status: 409,
        error: `Roll number ${row.roll_number} is already registered to ${firstNameOf(
          row.name
        )}. Check your roll number, or ask an organiser if this is really you.`,
      };
    }

    // First sign-in of an existing player: bind the Clerk account to them.
    if (clerkUserId && !row.clerk_user_id) {
      const { data: claimed } = await sb
        .from("players")
        .update({ clerk_user_id: clerkUserId, updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .is("clerk_user_id", null)
        .select(PLAYER_COLUMNS)
        .maybeSingle();
      if (claimed) return { ok: true, player: claimed as PlayerRow };
      // Lost the race — re-read and fall through to whatever won.
      const { data: reread } = await sb
        .from("players")
        .select(PLAYER_COLUMNS)
        .eq("id", row.id)
        .maybeSingle();
      if (reread) return { ok: true, player: reread as PlayerRow };
    }

    return { ok: true, player: row };
  }

  // 3. Brand new player.
  const { data: created, error: insErr } = await sb
    .from("players")
    .insert({ name: ident.name, roll_number: ident.roll, clerk_user_id: clerkUserId })
    .select(PLAYER_COLUMNS)
    .maybeSingle();

  if (created) return { ok: true, player: created as PlayerRow };

  // Unique violation: a concurrent request registered the same roll number
  // first. Re-read and re-run the checks above rather than guessing. Bounded,
  // so a violation we can't resolve by re-reading surfaces as an error instead
  // of looping.
  if (insErr && (insErr as any).code === "23505" && retriesLeft > 0) {
    return resolvePlayer(sb, ident, retriesLeft - 1);
  }

  return {
    ok: false,
    status: 500,
    error: insErr?.message || "Could not register player",
  };
}
