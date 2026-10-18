import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

// /p/* are public listing pages reached through QR codes (no login).
// /s/<token> is a private post sent to one client; the page itself checks the token.
const PUBLIC_PATHS = ["/login", "/api/health", "/p/", "/s/"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Pass the path to the root layout so public pages render without the CRM menu.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);
  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }
  const token = request.cookies.get("crm_session")?.value;
  const loginUrl = new URL("/login", request.url);
  if (!token) return NextResponse.redirect(loginUrl);
  try {
    await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret-change-me"));
    return NextResponse.next({ request: { headers: requestHeaders } });
  } catch {
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico)).*)"],
};
