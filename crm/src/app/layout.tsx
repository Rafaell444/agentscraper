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
  const isPublic = pathname.startsWith("/p/");
  const unread = session && !isPublic ? await prisma.notification.count({ where: { userId: session.id, readAt: null } }).catch(() => 0) : 0;
  return (
    <html lang={isPublic ? "en" : "ka"}>
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        {session && !isPublic ? <Nav user={session} unread={unread} /> : null}
        <main className="mx-auto max-w-[1400px] px-3 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-4 sm:py-6">{children}</main>
      </body>
    </html>
  );
}
