import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { fillFromCollector } from "@/lib/sharedPosts";

// Downloads the listing's photos once it has arrived.
export const maxDuration = 60;

/** Polled by the post editor while the collector fetches a MyHome listing. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  return NextResponse.json({ state: await fillFromCollector(id) });
}
