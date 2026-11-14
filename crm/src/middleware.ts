import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

// Same list as lib/auth PARTNER_PATHS (the middleware cannot import server-only code).
const PARTNER_PATHS = ["/clients", "/viewings", "/share", "/browse", "/api/shared-posts"];

// /p/* are public listing pages reached through QR codes (no login).
// /s/<token> is a private post sent to one client; the page itself checks the token.
// /catalog is the public Telegram mini app; /api/telegram/webhook checks its own secret.
// /flats, /flat/<ref>, /area/<district>, /sitemap.xml and /robots.txt are the public website for Google.
const PUBLIC_PATHS = ["/login", "/flat", "/area/", "/api/ext/", "/sitemap.xml", "/robots.txt", "/api/health", "/api/cron/", "/p/", "/s/", "/catalog", "/api/catalog/", "/api/telegram/webhook", "/api/social/photo/", "/legal/", "/tiktokGF7oQN29cAkOSIDrOtygoSsCQlPbEm8P.txt", "/tiktoku7S4UYyJpaLGSR99B6NThr39wOXtjj7i.txt"];

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
    const { payload } = await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret-change-me"));
    // A partner (one client segment) only reaches his clients and viewings; everything else goes to his clients.
    if (payload.role === "partner" && !PARTNER_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
      return NextResponse.redirect(new URL("/clients", request.url));
    }
    return NextResponse.next({ request: { headers: requestHeaders } });
  } catch {
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico)).*)"],
};
