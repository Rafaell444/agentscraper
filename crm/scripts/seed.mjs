// Create (or update) the first admin user.  Values come from the environment:
//   ADMIN_EMAIL (default admin@example.com), ADMIN_PASSWORD (default admin1234), ADMIN_NAME
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const email = (process.env.ADMIN_EMAIL ?? "admin@example.com").toLowerCase();
const password = process.env.ADMIN_PASSWORD ?? "admin1234";
const name = process.env.ADMIN_NAME ?? "Admin";

const passwordHash = await bcrypt.hash(password, 10);
await prisma.user.upsert({
  where: { email },
  update: { passwordHash, name, role: "admin", active: true },
  create: { email, name, passwordHash, role: "admin" },
});
console.log(`admin user ready: ${email}`);
await prisma.$disconnect();
