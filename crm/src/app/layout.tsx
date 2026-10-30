import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const metadata: Metadata = {
  title: "მესაკუთრე CRM",
  description: "Tbilisi owner listings CRM",
  manifest: "/manifest.json",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  appleWebApp: { capable: true, title: "CRM", statusBarStyle: "default" },
};

export const viewport = {
  themeColor: "#059669",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const pathname = (await headers()).get("x-pathname") ?? "";
  // The mini app draws its own full-screen layout.
  const isApp = pathname.startsWith("/catalog");
  const isPublic = pathname.startsWith("/p/") || pathname.startsWith("/s/") || pathname.startsWith("/flat") || isApp;
  const unread = session && !isPublic ? await prisma.notification.count({ where: { userId: session.id, readAt: null } }).catch(() => 0) : 0;
  if (isApp) {
    return (
      // telegram-web-app.js writes its viewport variables onto <html> before React loads.
      <html lang="en" suppressHydrationWarning>
        <body className="antialiased">{children}</body>
      </html>
    );
  }
  return (
    <html lang={isPublic ? "en" : "ka"}>
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        {session && !isPublic ? <Nav user={session} unread={unread} /> : null}
        <main className="mx-auto max-w-[1400px] px-3 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-4 sm:py-6">{children}</main>
      </body>
    </html>
  );
}
