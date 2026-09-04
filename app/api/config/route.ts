import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("game_config").select("*").eq("id", 1).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Do NOT leak words to the public. Only return safe fields.
  return NextResponse.json({
    mode: data.mode,
    max_guesses: data.max_guesses,
    time_limit_seconds: data.time_limit_seconds,
    rounds: data.rounds,
    is_open: data.is_open,
    word_length: 5,
  });
}
