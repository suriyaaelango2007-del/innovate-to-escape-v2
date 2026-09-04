-- =====================================================================
-- Multi-user hardening migration
-- Run ONCE in Supabase → SQL Editor. Safe to re-run (IF NOT EXISTS).
--
-- Fixes:
--  1. Duplicate OPEN attempts per player (the root cause of duplicate
--     leaderboard rows and players getting a fresh word on every reload).
--  2. No server-side deadline for 'timed' mode.
--  3. Phase 2 being locked on first submit, with no way to edit before
--     the final submission.
--  4. Player identity — adds clerk_user_id ahead of the Clerk migration.
--
-- IMPORTANT: step 3 rewrites existing duplicate open attempts. Read it
-- before running. Take a snapshot first (Supabase → Database → Backups).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Players — identity columns
-- ---------------------------------------------------------------------
alter table public.players
  add column if not exists clerk_user_id text,
  add column if not exists updated_at timestamptz not null default now();

-- Unique per Clerk user, but only for rows that actually have one, so
-- existing pre-Clerk players (all NULL) don't collide with each other.
create unique index if not exists players_clerk_user_id_key
  on public.players (clerk_user_id)
  where clerk_user_id is not null;


-- ---------------------------------------------------------------------
-- 2. Attempts — deadline + Phase 2 draft columns
-- ---------------------------------------------------------------------
alter table public.attempts
  -- Server-side deadline for 'timed' mode. NULL = untimed.
  add column if not exists deadline_at timestamptz,
  -- True when the attempt was closed by the clock rather than by the player.
  add column if not exists expired boolean not null default false,
  -- Phase 2 work-in-progress. Deliberately SEPARATE from the scored
  -- phase2_* columns so an unfinished draft can never leak into the
  -- leaderboard, the admin export, or a player's score.
  add column if not exists phase2_draft_words text[],
  add column if not exists phase2_draft_sentence text,
  add column if not exists phase2_draft_updated_at timestamptz;

create index if not exists attempts_player_idx
  on public.attempts (player_id);


-- ---------------------------------------------------------------------
-- 3. Clean up duplicate OPEN attempts
--    The unique index in step 4 cannot be created while duplicates
--    exist. For each player we keep the OLDEST open attempt:
--      - extra open attempts with no guesses are deleted (nothing lost)
--      - extra open attempts with guesses are closed and flagged, so the
--        data survives for you to inspect but stops blocking the player
-- ---------------------------------------------------------------------
with ranked as (
  select
    id,
    guess_count,
    row_number() over (
      partition by player_id
      order by started_at asc, id asc
    ) as rn
  from public.attempts
  where finished_at is null
)
delete from public.attempts a
using ranked r
where a.id = r.id
  and r.rn > 1
  and r.guess_count = 0;

with ranked as (
  select
    id,
    row_number() over (
      partition by player_id
      order by started_at asc, id asc
    ) as rn
  from public.attempts
  where finished_at is null
)
update public.attempts a
set finished_at = now(),
    expired = true
from ranked r
where a.id = r.id
  and r.rn > 1;


-- ---------------------------------------------------------------------
-- 4. Enforce: at most ONE open attempt per player, in the database.
--    This is the real fix for duplicates — the app-level check alone
--    always loses to two concurrent requests.
-- ---------------------------------------------------------------------
create unique index if not exists attempts_one_open_per_player
  on public.attempts (player_id)
  where finished_at is null;


-- ---------------------------------------------------------------------
-- 5. OPTIONAL — one attempt per player, ever (blocks replay farming).
--    The app already refuses to create a second attempt; this makes it
--    a hard guarantee. Leave commented unless you want it: with this on,
--    granting someone a retry means deleting their attempt row.
--    Run the SELECT first — it must return 0 rows before the index will
--    build.
-- ---------------------------------------------------------------------
-- select player_id, count(*) from public.attempts
--   group by player_id having count(*) > 1;
--
-- create unique index if not exists attempts_one_per_player
--   on public.attempts (player_id);
