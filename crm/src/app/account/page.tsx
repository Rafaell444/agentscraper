import { isPartner, requireMember } from "@/lib/auth";
import { Tx, tx } from "@/lib/partnerText";
import { Button, Card, Input, PageHeader } from "@/components/ui";
import { changeOwnPassword } from "./actions";

export const dynamic = "force-dynamic";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const me = await requireMember();
  const { msg } = await searchParams;
  const partner = isPartner(me);
  return (
    <div className="mx-auto max-w-md space-y-4">
      <PageHeader title={<Tx p={partner} ka="ჩემი ანგარიში" en="My account" hi="मेरा खाता" />} subtitle={`${me.name} · ${me.email}`} />
      {msg ? <p className={`rounded-lg px-3 py-2 text-sm ${msg.startsWith("ok:") ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"}`}>{msg.replace(/^(ok|err):/, "")}</p> : null}
      <Card title={<Tx p={partner} ka="პაროლის შეცვლა" en="Change password" hi="पासवर्ड बदलें" />}>
        <form action={changeOwnPassword} className="space-y-2">
          <Input name="current" type="password" required autoComplete="current-password" placeholder={tx(partner, "მიმდინარე პაროლი", "Current password")} />
          <Input name="next" type="password" required minLength={6} autoComplete="new-password" placeholder={tx(partner, "ახალი პაროლი (მინ. 6)", "New password (min. 6)")} />
          <Input name="again" type="password" required minLength={6} autoComplete="new-password" placeholder={tx(partner, "ახალი პაროლი კიდევ ერთხელ", "New password again")} />
          <Button type="submit" className="w-full">{tx(partner, "შეცვლა", "Change")}</Button>
        </form>
      </Card>
    </div>
  );
}
