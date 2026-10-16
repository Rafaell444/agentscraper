import { requireAdmin } from "@/lib/auth";
import { SETTING_KEYS, getSettings } from "@/lib/settings";
import { Button, Card, Input, PageHeader } from "@/components/ui";
import { saveSettings } from "./actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireAdmin();
  const settings = await getSettings();
  return (
    <div className="space-y-4">
      <PageHeader title="პარამეტრები" subtitle="სააგენტოს კონტაქტები, არხები და საჯარო გვერდი" />
      <Card>
        <form action={saveSettings} className="grid gap-4 md:grid-cols-2">
          {SETTING_KEYS.map((item) => (
            <label key={item.key} className={`block text-sm ${item.key === "public_intro_en" ? "md:col-span-2" : ""}`}>
              <span className="mb-1 block font-medium text-gray-700">{item.label}</span>
              {item.key === "public_intro_en" ? (
                <textarea name={item.key} defaultValue={settings[item.key]} rows={3} className="ui-field h-auto py-2" />
              ) : (
                <Input name={item.key} defaultValue={settings[item.key]} />
              )}
              <span className="mt-1 block text-xs text-gray-500">{item.hint}</span>
            </label>
          ))}
          <div className="md:col-span-2">
            <Button type="submit">შენახვა</Button>
          </div>
        </form>
      </Card>
      <Card title="სეკრეტები GitHub-ში (არა აქ)">
        <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
          <li><code>TELEGRAM_BOT_TOKEN</code> — @BotFather-ისგან; ბოტი დაამატეთ არხში ადმინად.</li>
          <li><code>FACEBOOK_PAGE_TOKEN</code> — გვერდის ტოკენი <code>pages_manage_posts</code> უფლებით (Meta for Developers).</li>
        </ul>
      </Card>
    </div>
  );
}
