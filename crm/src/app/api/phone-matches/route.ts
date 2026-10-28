import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { findPhoneMatches } from "@/lib/phones";

/** Live check while an agent types a phone number: what the CRM already has. */
export async function GET(request: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const matches = await findPhoneMatches(params.get("phone"), params.get("exclude") ?? undefined);
  return NextResponse.json({ matches });
}
