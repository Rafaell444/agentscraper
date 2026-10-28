import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** On Vercel every function instance opens its own pool, and Supabase's pooler
 * allows only a few clients in session mode (port 5432).  One connection per
 * instance keeps us under that; the transaction pooler (port 6543, preferred)
 * also needs pgbouncer=true because it does not support prepared statements. */
function datasourceUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw || !/^postgres(ql)?:\/\//.test(raw)) return raw;
  try {
    const url = new URL(raw);
    if (url.hostname.endsWith("pooler.supabase.com")) {
      if (!url.searchParams.has("connection_limit")) url.searchParams.set("connection_limit", "1");
      if (url.port === "6543" && !url.searchParams.has("pgbouncer")) url.searchParams.set("pgbouncer", "true");
    }
    return url.toString();
  } catch {
    return raw;
  }
}

// One client per instance, reused across requests (and across hot reloads in dev).
export const prisma = globalForPrisma.prisma ?? new PrismaClient({ datasourceUrl: datasourceUrl() });
globalForPrisma.prisma = prisma;
