import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { checkAdmin } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("attempts")
    .select("id, name, roll_number, word, guess_count, solved, duration_ms, score, mode, started_at, finished_at, phase2_words, phase2_correct_count, phase2_sentence, phase2_sentence_approved, phase2_score, phase2_finished_at")
    .order("started_at", { ascending: false })
    .limit(1000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ attempts: data ?? [] });
}

export async function DELETE(req: NextRequest) {
  if (!checkAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, reset_all } = await req.json();
  const sb = supabaseAdmin();

  if (reset_all === true) {
    const { error } = await sb.from("attempts").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, cleared: "all" });
  }
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { error } = await sb.from("attempts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id });
}
