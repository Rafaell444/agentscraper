import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** Supabase's pooler has two modes on the same host and credentials:
 * session mode (port 5432) keeps a server connection for as long as a client
 * stays connected and allows only 15 clients, which warm Vercel instances
 * use up ("EMAXCONNSESSION max clients reached"); transaction mode (port
 * 6543) hands the connection back after every query.  The app always talks
 * to transaction mode (pgbouncer=true: no prepared statements); DIRECT_URL
 * keeps session mode for `prisma db push` during the build. */
export function runtimeDatabaseUrl(raw: string | undefined): string | undefined {
  if (!raw || !/^postgres(ql)?:\/\//.test(raw)) return raw;
  try {
    const url = new URL(raw);
    if (!url.hostname.endsWith("pooler.supabase.com")) return raw;
    if (url.port === "" || url.port === "5432") url.port = "6543";
    if (url.port === "6543") url.searchParams.set("pgbouncer", "true");
    if (!url.searchParams.has("connection_limit")) url.searchParams.set("connection_limit", "1");
    return url.toString();
  } catch {
    return raw;
  }
}

// One client per instance, reused across requests (and across hot reloads in dev).
export const prisma = globalForPrisma.prisma ?? new PrismaClient({ datasourceUrl: runtimeDatabaseUrl(process.env.DATABASE_URL) });
globalForPrisma.prisma = prisma;
