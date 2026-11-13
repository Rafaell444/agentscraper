import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "./db";

export const SESSION_COOKIE = "crm_session";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  segment?: string | null;
};

/**
 * A partner (e.g. the agent for Indian clients) sees only the clients of his
 * segment and their viewings, and the public mini app: no listings, owners,
 * posts, channels, settings or other people's work.
 */
export const PARTNER_PATHS = ["/clients", "/viewings", "/account", "/share", "/browse", "/api/shared-posts"];

export function isPartner(user: Pick<SessionUser, "role">): boolean {
  return user.role === "partner";
}

function secret(): Uint8Array {
  return new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret-change-me");
}

export async function createSession(user: SessionUser): Promise<void> {
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.id !== "string") return null;
    return {
      id: payload.id,
      email: String(payload.email ?? ""),
      name: String(payload.name ?? ""),
      role: String(payload.role ?? "agent"),
      segment: typeof payload.segment === "string" ? payload.segment : null,
    };
  } catch {
    return null;
  }
}

/** Agency staff (admin or agent): a partner is sent to his clients. */
export async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (isPartner(session)) redirect("/clients");
  return session;
}

/** Anyone logged in, partners included (the clients and viewings pages, which scope what a partner sees). */
export async function requireMember(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function requireAdmin(): Promise<SessionUser> {
  const session = await requireUser();
  if (session.role !== "admin") redirect("/");
  return session;
}

export async function verifyLogin(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user || !user.active) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  return ok ? user : null;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}
