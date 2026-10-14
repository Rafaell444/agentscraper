import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { daysAgo, fmtDate } from "@/lib/format";
import { Button, Card, Input, PageHeader, Select } from "@/components/ui";
import { createUser, resetPassword, setUserActive } from "./actions";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const me = await requireUser();
  const since30 = daysAgo(30);
  const [users, leads, activities] = await Promise.all([
    prisma.user.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] }),
    prisma.lead.findMany({ select: { assignedToId: true, status: true } }),
    prisma.activity.findMany({ where: { createdAt: { gte: since30 } }, select: { userId: true, type: true } }),
  ]);
  const stat = (userId: string) => ({
    assigned: leads.filter((l) => l.assignedToId === userId).length,
    interested: leads.filter((l) => l.assignedToId === userId && ["interested", "meeting"].includes(l.status)).length,
    signed: leads.filter((l) => l.assignedToId === userId && l.status === "signed").length,
    calls: activities.filter((a) => a.userId === userId && a.type === "call").length,
    notes: activities.filter((a) => a.userId === userId && a.type === "note").length,
  });
  const initials = (name: string) => name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="space-y-4">
      <PageHeader title="აგენტები" subtitle="აქტივობა ბოლო 30 დღეში" />

      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {users.map((user) => {
          const s = stat(user.id);
          return (
            <li key={user.id} className={`ui-card p-4 ${user.active ? "" : "opacity-50"}`}>
              <div className="flex items-center gap-3">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${user.role === "admin" ? "bg-violet-600" : "bg-emerald-600"}`}>{initials(user.name) || "?"}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold text-gray-900">{user.name}</span>
                    {user.id === me.id ? <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">თქვენ</span> : null}
                  </div>
                  <div className="truncate text-xs text-gray-500">{user.email}</div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${user.role === "admin" ? "bg-violet-100 text-violet-800" : "bg-emerald-100 text-emerald-800"}`}>
                  {user.role === "admin" ? "ადმინი" : "აგენტი"}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-5 gap-1 text-center">
                {[
                  ["ლიდი", s.assigned],
                  ["დაინტ.", s.interested],
                  ["ხელშ.", s.signed],
                  ["ზარი", s.calls],
                  ["ჩანაწ.", s.notes],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-lg bg-gray-50 py-1.5">
                    <div className="text-base font-bold tabular-nums text-gray-900">{value}</div>
                    <div className="text-[10px] text-gray-500">{label}</div>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-[11px] text-gray-400">შექმნილია {fmtDate(user.createdAt)}</div>
              {me.role === "admin" ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
                  <form action={resetPassword} className="flex min-w-0 flex-1 gap-1">
                    <input type="hidden" name="id" value={user.id} />
                    <Input name="password" type="password" placeholder="ახალი პაროლი" minLength={6} className="min-w-0 flex-1" />
                    <Button variant="secondary" type="submit">
                      შეცვლა
                    </Button>
                  </form>
                  {user.id !== me.id ? (
                    <form action={setUserActive}>
                      <input type="hidden" name="id" value={user.id} />
                      <input type="hidden" name="active" value={user.active ? "0" : "1"} />
                      <Button variant={user.active ? "danger" : "secondary"} type="submit">
                        {user.active ? "გათიშვა" : "ჩართვა"}
                      </Button>
                    </form>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {me.role === "admin" ? (
        <Card title="ახალი აგენტის დამატება">
          <form action={createUser} className="grid gap-2 md:grid-cols-5">
            <Input name="name" required placeholder="სახელი და გვარი" />
            <Input name="email" type="email" required placeholder="ელფოსტა" />
            <Input name="password" type="password" required minLength={6} placeholder="პაროლი (მინ. 6)" />
            <Select name="role" defaultValue="agent">
              <option value="agent">აგენტი</option>
              <option value="admin">ადმინი</option>
            </Select>
            <Button type="submit">დამატება</Button>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
