import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { rankedLeaderboard } from "@/lib/leaderboard";

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

export async function GET() {
  const { rows, error } = await rankedLeaderboard(supabaseAdmin());

  if (error) {
    return new NextResponse(JSON.stringify({ error }), {
      status: 500,
      headers: NO_CACHE_HEADERS,
    });
  }

  return new NextResponse(
    JSON.stringify({ leaderboard: rows, fetched_at: Date.now() }),
    { headers: NO_CACHE_HEADERS }
  );
}
