import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { password } = await req.json();
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    return NextResponse.json({ error: "ADMIN_PASSWORD not configured" }, { status: 500 });
  }
  if (password !== expected) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
