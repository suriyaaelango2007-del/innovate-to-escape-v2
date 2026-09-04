import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export function supabaseAnon() {
  return createClient(url, anonKey, { auth: { persistSession: false } });
}

// Server-only: uses the service role key. NEVER import this in a client component.
export function supabaseAdmin() {
  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type GameMode = "classic" | "timed" | "tournament";

export type GameConfig = {
  id: number;
  mode: GameMode;
  max_guesses: number;
  time_limit_seconds: number;
  rounds: number;
  words: string[];
  is_open: boolean;
  updated_at: string;
};
