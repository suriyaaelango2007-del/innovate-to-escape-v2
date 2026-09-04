-- =====================================================================
-- Phase 2 migration — run this ONCE in your existing Supabase project's
-- SQL Editor. Safe to re-run (uses IF NOT EXISTS).
--
-- Adds:
--  - game_config.word_meta      — per-word Wikipedia URL + target words
--  - game_config.phase2_enabled — master switch for the phase 2 stage
--  - attempts.phase2_*          — phase 2 submission + scoring state
-- =====================================================================

alter table public.game_config
  add column if not exists word_meta jsonb not null default '{}'::jsonb,
  add column if not exists phase2_enabled boolean not null default true;

alter table public.attempts
  add column if not exists phase2_words text[],
  add column if not exists phase2_correct_count int not null default 0,
  add column if not exists phase2_sentence text,
  add column if not exists phase2_sentence_approved boolean not null default false,
  add column if not exists phase2_score int not null default 0,
  add column if not exists phase2_finished_at timestamptz;

-- Recreate the (unused-by-app) leaderboard view with total score.
-- We DROP first because CREATE OR REPLACE VIEW cannot reorder/rename columns,
-- and the previous version's column layout differs. Safe: the app does not
-- read this view, so nothing else depends on it.
drop view if exists public.leaderboard;

create view public.leaderboard
  with (security_invoker = on) as
select
  a.id,
  a.name,
  a.roll_number,
  a.guess_count,
  a.solved,
  a.duration_ms,
  a.score,
  a.phase2_score,
  (a.score + a.phase2_score) as total_score,
  a.finished_at
from public.attempts a
where a.finished_at is not null
order by (a.score + a.phase2_score) desc, a.duration_ms asc
limit 200;
