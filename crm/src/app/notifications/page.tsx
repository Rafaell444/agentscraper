import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { markAllRead, markRead } from "./actions";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const me = await requireUser();
  const items = await prisma.notification.findMany({ where: { userId: me.id }, orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <div className="space-y-4">
      <PageHeader
        title="შეტყობინებები"
        subtitle="ახალი განცხადებები, რომლებიც თქვენი კლიენტების მოთხოვნას ემთხვევა, და შეხსენებები"
        actions={
          <form action={markAllRead}>
            <Button variant="secondary" size="sm" type="submit">ყველა წაკითხულად</Button>
          </form>
        }
      />
      <Card>
        {items.length === 0 ? (
          <EmptyState title="შეტყობინებები არ არის" hint="კლიენტს მოთხოვნა შეუვსეთ — ახალი შესაბამისი განცხადებები აქ გამოჩნდება" />
        ) : (
          <ul className="divide-y divide-gray-100">
            {items.map((n) => (
              <li key={n.id} className={`flex items-start gap-3 py-3 ${n.readAt ? "opacity-60" : ""}`}>
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-gray-300" : "bg-emerald-500"}`} />
                <div className="min-w-0 flex-1">
                  {n.link ? (
                    <Link href={n.link} className="block text-sm font-medium text-gray-900 hover:text-emerald-700">{n.title}</Link>
                  ) : (
                    <div className="text-sm font-medium text-gray-900">{n.title}</div>
                  )}
                  {n.body ? <div className="text-xs text-gray-600">{n.body}</div> : null}
                  <div className="text-[11px] text-gray-400">{fmtDate(n.createdAt, true)}</div>
                </div>
                {!n.readAt ? (
                  <form action={markRead}><input type="hidden" name="id" value={n.id} /><Button size="sm" variant="ghost" type="submit">✓</Button></form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
