import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { checkAdmin } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

function csvEscape(v: any): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("attempts")
    .select("name, roll_number, word, guess_count, solved, duration_ms, score, mode, started_at, finished_at, phase2_correct_count, phase2_sentence, phase2_sentence_approved, phase2_score, phase2_finished_at")
    .order("score", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const headers = [
    "name","roll_number","word","guess_count","solved","duration_seconds","wordle_score",
    "phase2_correct_words","phase2_sentence","phase2_sentence_approved","phase2_score",
    "total_score","mode","started_at","finished_at","phase2_finished_at",
  ];
  const rows = (data ?? []).map((a) => [
    a.name, a.roll_number, a.word, a.guess_count, a.solved,
    Math.round((a.duration_ms || 0) / 1000), a.score,
    a.phase2_correct_count || 0, a.phase2_sentence || "",
    a.phase2_sentence_approved || false, a.phase2_score || 0,
    (a.score || 0) + (a.phase2_score || 0),
    a.mode, a.started_at, a.finished_at, a.phase2_finished_at || "",
  ].map(csvEscape).join(","));
  const csv = [headers.join(","), ...rows].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="innovate-to-escape-results-${new Date().toISOString().slice(0,10)}.csv"`,
    },
  });
}
