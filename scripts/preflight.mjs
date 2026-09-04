#!/usr/bin/env node
/**
 * Preflight check — run before the event, and after each migration.
 *
 *   npm run preflight
 *
 * Read-only. Verifies that env vars are present, Supabase is reachable, every
 * column and table the app needs actually exists, and that there are no leftover
 * duplicate open attempts. Prints PASS/FAIL only — never the value of a secret.
 */

import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Load .env.local without printing anything from it.
// ---------------------------------------------------------------------------
function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

// ---------------------------------------------------------------------------
// Tiny result recorder
// ---------------------------------------------------------------------------
const results = [];
let failed = 0;
let warned = 0;

function pass(name, detail = "") {
  results.push(["PASS", name, detail]);
}
function fail(name, detail = "") {
  results.push(["FAIL", name, detail]);
  failed++;
}
function warn(name, detail = "") {
  results.push(["WARN", name, detail]);
  warned++;
}

// ---------------------------------------------------------------------------
// 1. Environment variables
// ---------------------------------------------------------------------------
const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ADMIN_PASSWORD",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
];
const OPTIONAL_ENV = [
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_CLERK_SIGN_IN_URL",
  "NEXT_PUBLIC_CLERK_SIGN_UP_URL",
];

for (const key of REQUIRED_ENV) {
  if (process.env[key]) pass(`env ${key}`, "set");
  else fail(`env ${key}`, "MISSING");
}
for (const key of OPTIONAL_ENV) {
  if (process.env[key]) pass(`env ${key}`, "set");
  else warn(`env ${key}`, "not set (optional)");
}

// ---------------------------------------------------------------------------
// 2. Clerk
// ---------------------------------------------------------------------------
const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || "";
const sk = process.env.CLERK_SECRET_KEY || "";

const pkEnv = pk.startsWith("pk_live_") ? "live" : pk.startsWith("pk_test_") ? "test" : null;
const skEnv = sk.startsWith("sk_live_") ? "live" : sk.startsWith("sk_test_") ? "test" : null;

if (!pkEnv) fail("Clerk publishable key", "not a pk_test_/pk_live_ key");
if (!skEnv) fail("Clerk secret key", "not an sk_test_/sk_live_ key");

// Mixing a test publishable key with a live secret key (or vice versa) fails at
// runtime in confusing ways — catch it here instead.
if (pkEnv && skEnv) {
  if (pkEnv !== skEnv) {
    fail("Clerk key pair", `MISMATCH — publishable is ${pkEnv}, secret is ${skEnv}`);
  } else if (pkEnv === "live") {
    pass("Clerk key pair", "production (pk_live_ + sk_live_)");
  } else {
    warn("Clerk key pair", "DEVELOPMENT — fine locally, must be pk_live_/sk_live_ in production");
  }
}

// Actually authenticate against Clerk's Backend API. This is the check that
// proves the secret key is real and the instance is reachable.
if (sk) {
  try {
    const res = await fetch("https://api.clerk.com/v1/users?limit=1", {
      headers: { Authorization: `Bearer ${sk}` },
    });
    if (res.ok) {
      pass("Clerk API auth", "secret key accepted");
      const count = await fetch("https://api.clerk.com/v1/users/count", {
        headers: { Authorization: `Bearer ${sk}` },
      })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      if (count && typeof count.total_count === "number") {
        if (count.total_count === 0) {
          warn("Clerk users", "0 signed-up users — sign up once to test the flow");
        } else {
          pass("Clerk users", `${count.total_count} signed-up user(s)`);
        }
      }
    } else if (res.status === 401) {
      fail("Clerk API auth", "401 — CLERK_SECRET_KEY is invalid or revoked");
    } else {
      fail("Clerk API auth", `HTTP ${res.status}`);
    }
  } catch (e) {
    warn("Clerk API auth", `could not reach api.clerk.com (${e.message})`);
  }
}

// The app scaffolds these routes; Clerk needs to be pointed at them.
if ((process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL || "/sign-in") !== "/sign-in") {
  warn("Clerk sign-in URL", "not /sign-in — make sure that route exists");
}

// ---------------------------------------------------------------------------
// 3. Database
// ---------------------------------------------------------------------------
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  report();
  console.log("\nSkipped all database checks — Supabase env vars missing.\n");
  process.exit(1);
}

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Probe a single column. PostgREST returns 42703 when a column doesn't exist,
// which is exactly how we detect a migration that hasn't been run.
async function checkColumn(table, column) {
  const { error } = await sb.from(table).select(column).limit(1);
  if (!error) return pass(`${table}.${column}`, "exists");
  if (error.code === "42703" || /column .* does not exist/i.test(error.message)) {
    return fail(`${table}.${column}`, "MISSING — run the migration");
  }
  return fail(`${table}.${column}`, error.message);
}

// Connectivity + config row
{
  const { data, error } = await sb
    .from("game_config").select("id, mode, max_guesses, is_open, phase2_enabled")
    .eq("id", 1).maybeSingle();
  if (error) fail("Supabase connection", error.message);
  else if (!data) fail("game_config row", "missing — run schema.sql");
  else {
    pass("Supabase connection", "reachable");
    pass(
      "game_config row",
      `mode=${data.mode} max_guesses=${data.max_guesses} open=${data.is_open} phase2=${data.phase2_enabled}`
    );
  }
}

// Columns the app reads. A missing one here means the app WILL crash at runtime.
await checkColumn("players", "clerk_user_id");
await checkColumn("attempts", "deadline_at");
await checkColumn("attempts", "expired");
await checkColumn("attempts", "phase2_draft_words");
await checkColumn("attempts", "phase2_draft_sentence");
await checkColumn("attempts", "phase2_draft_updated_at");
// Pre-existing, but check anyway so a fresh install is caught too.
await checkColumn("attempts", "phase2_score");
await checkColumn("attempts", "phase2_finished_at");

// Word list must actually contain playable words.
{
  const { data } = await sb.from("game_config").select("words, word_meta").eq("id", 1).maybeSingle();
  const words = (data?.words || []).filter((w) => w && w.length === 5);
  if (words.length === 0) fail("word list", "no valid 5-letter words configured — set them in /admin");
  else pass("word list", `${words.length} playable word(s)`);

  const meta = data?.word_meta || {};
  const configured = Object.keys(meta).length;
  if (configured === 0) warn("phase 2 metadata", "no per-word entries — targets will be empty");
  else pass("phase 2 metadata", `${configured} word(s) configured`);
}

// Duplicate open attempts — the bug that produced duplicate leaderboard rows.
// After the migration the unique index makes this impossible; before it, this
// tells you how much cleanup the migration will do.
{
  const { data, error } = await sb
    .from("attempts").select("player_id").is("finished_at", null).limit(5000);
  if (error) {
    warn("duplicate open attempts", error.message);
  } else {
    const seen = new Map();
    for (const r of data || []) seen.set(r.player_id, (seen.get(r.player_id) || 0) + 1);
    const dupes = [...seen.values()].filter((n) => n > 1).length;
    if (dupes === 0) pass("duplicate open attempts", `none (${data?.length || 0} open)`);
    else fail("duplicate open attempts", `${dupes} player(s) have 2+ open attempts — the migration cleans these up`);
  }
}

report();

function report() {
  const width = Math.max(...results.map(([, name]) => name.length), 10);
  console.log("\n  Innovate To Escape — preflight\n");
  for (const [status, name, detail] of results) {
    const mark = status === "PASS" ? "\x1b[32m✓\x1b[0m" : status === "WARN" ? "\x1b[33m!\x1b[0m" : "\x1b[31m✗\x1b[0m";
    console.log(`  ${mark} ${name.padEnd(width)}  ${detail}`);
  }
  console.log("");
  if (failed > 0) {
    console.log(`  \x1b[31m${failed} check(s) failed\x1b[0m${warned ? `, ${warned} warning(s)` : ""}.`);
    console.log("  If columns are missing, run supabase/migration-multiuser.sql in the Supabase SQL editor.\n");
  } else {
    console.log(`  \x1b[32mAll checks passed\x1b[0m${warned ? ` (${warned} warning(s))` : ""}.\n`);
  }
}

process.exit(failed > 0 ? 1 : 0);
