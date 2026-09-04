import { NextRequest } from "next/server";

export function checkAdmin(req: NextRequest): boolean {
  const provided =
    req.headers.get("x-admin-password") ||
    (req.nextUrl.searchParams.get("password") ?? "");
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  if (!provided) return false;
  // constant-time-ish compare
  if (provided.length !== expected.length) return false;
  let ok = 0;
  for (let i = 0; i < expected.length; i++) {
    ok |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return ok === 0;
}
