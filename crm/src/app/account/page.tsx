import { requireMember } from "@/lib/auth";
import { Button, Card, Input, PageHeader } from "@/components/ui";
import { changeOwnPassword } from "./actions";

export const dynamic = "force-dynamic";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const me = await requireMember();
  const { msg } = await searchParams;
  return (
    <div className="mx-auto max-w-md space-y-4">
      <PageHeader title="ჩემი ანგარიში" subtitle={`${me.name} · ${me.email}`} />
      {msg ? <p className={`rounded-lg px-3 py-2 text-sm ${msg.startsWith("ok:") ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"}`}>{msg.replace(/^(ok|err):/, "")}</p> : null}
      <Card title="პაროლის შეცვლა">
        <form action={changeOwnPassword} className="space-y-2">
          <Input name="current" type="password" required autoComplete="current-password" placeholder="მიმდინარე პაროლი" />
          <Input name="next" type="password" required minLength={6} autoComplete="new-password" placeholder="ახალი პაროლი (მინ. 6)" />
          <Input name="again" type="password" required minLength={6} autoComplete="new-password" placeholder="ახალი პაროლი კიდევ ერთხელ" />
          <Button type="submit" className="w-full">შეცვლა</Button>
        </form>
      </Card>
    </div>
  );
}
