import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { checkAdmin } from "@/lib/adminAuth";
import { safeWikiUrl } from "@/lib/phase2";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

const NO_CACHE_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "Pragma": "no-cache",
  "Expires": "0",
};

function json(payload: any, status = 200) {
  return new NextResponse(JSON.stringify(payload), { status, headers: NO_CACHE_HEADERS });
}

export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) return json({ error: "Unauthorized" }, 401);
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("game_config").select("*").eq("id", 1).single();
  if (error) return json({ error: error.message }, 500);
  return json({ ...data, _fetched_at: Date.now() });
}

export async function PUT(req: NextRequest) {
  if (!checkAdmin(req)) return json({ error: "Unauthorized" }, 401);
  const body = await req.json();
  const updates: Record<string, any> = {};

  if (typeof body.mode === "string" && ["classic", "timed", "tournament"].includes(body.mode)) {
    updates.mode = body.mode;
  }
  if (typeof body.max_guesses === "number" && body.max_guesses >= 1 && body.max_guesses <= 12) {
    updates.max_guesses = body.max_guesses;
  }
  if (typeof body.time_limit_seconds === "number" && body.time_limit_seconds >= 30 && body.time_limit_seconds <= 3600) {
    updates.time_limit_seconds = body.time_limit_seconds;
  }
  if (typeof body.rounds === "number" && body.rounds >= 1 && body.rounds <= 20) {
    updates.rounds = body.rounds;
  }
  if (Array.isArray(body.words)) {
    const cleaned = body.words
      .map((w: any) => String(w).trim().toUpperCase())
      .filter((w: string) => /^[A-Z]{5}$/.test(w));
    if (cleaned.length === 0) {
      return json({ error: "Word list must contain at least one 5-letter word" }, 400);
    }
    updates.words = cleaned;
  }
  if (typeof body.is_open === "boolean") {
    updates.is_open = body.is_open;
  }
  if (typeof body.phase2_enabled === "boolean") {
    updates.phase2_enabled = body.phase2_enabled;
  }
  if (body.word_meta && typeof body.word_meta === "object" && !Array.isArray(body.word_meta)) {
    // Sanitize: normalize keys, cap sizes, validate URLs, strip stray fields.
    const cleaned: Record<string, { url: string; target_words: string[]; target_sentence?: string }> = {};
    const entries = Object.entries(body.word_meta as Record<string, any>);
    if (entries.length > 200) {
      return json({ error: "Too many entries in word_meta (max 200)" }, 400);
    }
    for (const [rawKey, rawVal] of entries) {
      const key = String(rawKey || "").trim().toUpperCase();
      if (!/^[A-Z]{5}$/.test(key)) continue;
      const v = (rawVal && typeof rawVal === "object") ? rawVal : {};
      const url = safeWikiUrl(typeof v.url === "string" ? v.url : "", key);
      const targetWords = Array.isArray(v.target_words) ? v.target_words : [];
      const tw = targetWords
        .slice(0, 40)
        .map((s: any) => String(s || "").trim())
        .filter((s: string) => s.length >= 2 && s.length <= 40);

      const entry: { url: string; target_words: string[]; target_sentence?: string } = {
        url,
        target_words: tw,
      };
      if (typeof v.target_sentence === "string") {
        const ts = v.target_sentence.trim().slice(0, 500);
        if (ts.length > 0) entry.target_sentence = ts;
      }
      cleaned[key] = entry;
    }
    updates.word_meta = cleaned;
  }
  updates.updated_at = new Date().toISOString();

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("game_config").update(updates).eq("id", 1).select("*").single();
  if (error) return json({ error: error.message }, 500);
  return json({ ...data, _saved_at: Date.now(), _saved_keys: Object.keys(updates) });
}
