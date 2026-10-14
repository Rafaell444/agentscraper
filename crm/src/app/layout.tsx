import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "მესაკუთრე CRM",
  description: "Tbilisi owner listings CRM",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <html lang="ka">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        {session ? <Nav user={session} /> : null}
        <main className="mx-auto max-w-[1400px] px-3 py-4 sm:px-4 sm:py-6">{children}</main>
      </body>
    </html>
  );
}
