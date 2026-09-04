-- ============================================================
-- Innovate To Escape — Wordle game schema
-- Run this in Supabase → SQL Editor → New Query → Paste → Run
-- ============================================================

-- Players: one row per unique (name, roll_number)
create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  roll_number text not null unique,
  -- Set once Clerk login is wired up; NULL for form-registered players.
  clerk_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Unique per Clerk user, but only for rows that have one, so pre-Clerk
-- players (all NULL) don't collide with each other.
create unique index if not exists players_clerk_user_id_key
  on public.players (clerk_user_id)
  where clerk_user_id is not null;

-- Attempts: one row per game session
create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  name text not null,
  roll_number text not null,
  word text not null,
  guesses jsonb not null default '[]'::jsonb,
  guess_count int not null default 0,
  solved boolean not null default false,
  duration_ms int not null default 0,
  score int not null default 0,
  mode text not null default 'classic',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  -- Server-enforced deadline for 'timed' mode. NULL = untimed.
  deadline_at timestamptz,
  -- True when the clock closed the attempt rather than the player.
  expired boolean not null default false,
  -- Phase 2 (Wikipedia article word-identification + sentence)
  phase2_words text[],
  phase2_correct_count int not null default 0,
  phase2_sentence text,
  phase2_sentence_approved boolean not null default false,
  phase2_score int not null default 0,
  phase2_finished_at timestamptz,
  -- Phase 2 work-in-progress. Separate from the scored columns above so an
  -- unfinished draft can never leak into a score, the leaderboard or the export.
  phase2_draft_words text[],
  phase2_draft_sentence text,
  phase2_draft_updated_at timestamptz
);

create index if not exists attempts_score_idx on public.attempts (solved desc, score desc, duration_ms asc);
create index if not exists attempts_roll_idx on public.attempts (roll_number);
create index if not exists attempts_player_idx on public.attempts (player_id);

-- At most ONE open attempt per player. This is what stops concurrent starts,
-- second tabs and reloads from handing the same person several games — an
-- application-level check alone always loses that race.
create unique index if not exists attempts_one_open_per_player
  on public.attempts (player_id)
  where finished_at is null;

-- Game config: single row, id = 1
create table if not exists public.game_config (
  id int primary key default 1,
  mode text not null default 'classic',            -- 'classic' | 'timed' | 'tournament'
  max_guesses int not null default 6,
  time_limit_seconds int not null default 300,     -- used for 'timed' mode
  rounds int not null default 1,                   -- used for 'tournament'
  words text[] not null default array['CLOUD','ROBOT','LOGIC','PIXEL','DEBUG','LEARN','BUILD','SOLVE','SPARK','THINK']::text[],
  is_open boolean not null default true,
  -- Phase 2: {"CLOUD": {"url":"https://en.wikipedia.org/wiki/Cloud","target_words":["vapor","atmosphere"]}}
  word_meta jsonb not null default '{}'::jsonb,
  phase2_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint game_config_singleton check (id = 1)
);

insert into public.game_config (id) values (1)
on conflict (id) do nothing;

-- Row Level Security: keep tables locked; server routes use the service role key
alter table public.players enable row level security;
alter table public.attempts enable row level security;
alter table public.game_config enable row level security;

-- (Optional) allow anon read on leaderboard-friendly view
create or replace view public.leaderboard as
select
  a.id,
  a.name,
  a.roll_number,
  a.guess_count,
  a.solved,
  a.duration_ms,
  a.score,
  a.finished_at
from public.attempts a
where a.finished_at is not null
order by a.solved desc, a.score desc, a.duration_ms asc
limit 200;

grant select on public.leaderboard to anon, authenticated;
