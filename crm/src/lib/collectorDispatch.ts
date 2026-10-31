// Start the listings collector (GitHub workflow monitor.yml) every 30
// minutes from the CRM.  GitHub's own schedule for it ("twice an hour")
// runs a few times a day at best; a workflow_dispatch starts at once.  Uses
// the same GITHUB_DISPATCH_TOKEN as "import from MyHome" (lib/sharedPosts).

import { prisma } from "./db";

const EVERY_MS = 28 * 60_000;
const KEY = "collector_dispatched_at";

export function collectorDispatchConfigured(): boolean {
  return Boolean(process.env.GITHUB_DISPATCH_TOKEN);
}

export async function lastCollectorDispatch(): Promise<Date | null> {
  const row = await prisma.setting.findUnique({ where: { key: KEY } });
  return row ? new Date(row.value) : null;
}

/** Dispatch monitor.yml if the last dispatch was 28+ minutes ago (or minGapMs); true when a run was started. */
export async function dispatchCollectorIfDue(minGapMs = EVERY_MS): Promise<boolean> {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) return false;
  const last = await lastCollectorDispatch();
  if (last && Date.now() - last.getTime() < minGapMs) return false;
  // Claim the slot first, so two CRM instances do not both start a run.
  const now = new Date();
  const claimed = await prisma.setting.updateMany({ where: { key: KEY, value: last ? last.toISOString() : "" }, data: { value: now.toISOString() } });
  if (!claimed.count) {
    if (last) return false;
    try {
      await prisma.setting.create({ data: { key: KEY, value: now.toISOString() } });
    } catch {
      return false; // another instance created it a moment ago
    }
  }
  const repo = process.env.GITHUB_REPOSITORY || "Rafaell444/agentscraper";
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/monitor.yml/dispatches`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "crm" },
      body: JSON.stringify({ ref: "main" }),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    return response.status === 204;
  } catch {
    return false;
  }
}
