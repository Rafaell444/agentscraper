// Switch the Prisma datasource to PostgreSQL when DATABASE_URL points at
// Postgres (Supabase on Vercel); keep SQLite otherwise.  Run before
// `prisma generate` / `prisma db push`.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, "..", "prisma", "schema.prisma");
const url = process.env.DATABASE_URL ?? "";
const wantPostgres = /^postgres(ql)?:\/\//.test(url);

let schema = readFileSync(schemaPath, "utf8");
const sqliteBlock = /datasource db \{[\s\S]*?\n\}/;
const block = wantPostgres
  ? `datasource db {\n  provider  = "postgresql"\n  url       = env("DATABASE_URL")\n  directUrl = env("DIRECT_URL")\n}`
  : `datasource db {\n  provider = "sqlite"\n  url      = env("DATABASE_URL")\n}`;
const next = schema.replace(sqliteBlock, block);
if (next !== schema) {
  writeFileSync(schemaPath, next);
  console.log(`prisma datasource set to ${wantPostgres ? "postgresql" : "sqlite"}`);
}
