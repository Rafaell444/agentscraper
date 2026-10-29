import { prisma } from "@/lib/db";
import { phoneDigits } from "@/lib/phones";
import { asLang, headline, priceText, dealKind, DEAL_LABEL } from "@/lib/catalog";
import { notifyRecipients, verifyInitData } from "@/lib/telegram";

// Requests from the mini app.  Each one becomes (or updates) a client in the
// CRM, and the agency phones get a Telegram message right away.

type Body = {
  kind?: string;
  ref?: number;
  name?: string;
  phone?: string;
  message?: string;
  lang?: string;
  initData?: string;
  prefs?: { deal?: string; budgetMax?: number; roomsMin?: number; areas?: string[]; moveIn?: string; pets?: boolean };
  alerts?: boolean;
};

const KIND_LABEL: Record<string, string> = { viewing: "🗓 ჩვენების მოთხოვნა", question: "❓ კითხვა", search: "🔎 „მომიძებნეთ ბინა“" };

function clip(value: unknown, max: number): string {
  return String(value ?? "").replace(/[<>]/g, "").trim().slice(0, max);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body) return Response.json({ ok: false, error: "bad request" }, { status: 400 });
  const kind = ["viewing", "question", "search"].includes(body.kind ?? "") ? body.kind! : "question";
  const tgUser = verifyInitData(body.initData ?? "");
  const name = clip(body.name, 80) || [tgUser?.first_name, tgUser?.last_name].filter(Boolean).join(" ") || "Telegram";
  const phone = clip(body.phone, 30);
  const digits = phoneDigits(phone) || phone.replace(/\D/g, "");
  if (!tgUser && digits.length < 7) return Response.json({ ok: false, error: "phone" }, { status: 400 });
  const message = clip(body.message, 1000);
  const lang = asLang(body.lang ?? tgUser?.language_code);
  const tgUserId = tgUser ? String(tgUser.id) : null;
  const username = tgUser?.username ? `@${tgUser.username}` : null;

  // A few requests per hour per person is plenty.
  const recent = await prisma.catalogLead.count({
    where: { createdAt: { gte: new Date(Date.now() - 3600_000) }, OR: [...(tgUserId ? [{ tgUserId }] : []), ...(digits ? [{ phone: { contains: digits } }] : [])] },
  });
  if (recent >= 6) return Response.json({ ok: false, error: "too many" }, { status: 429 });

  const post = body.ref ? await prisma.sharedPost.findFirst({ where: { refNo: Number(body.ref), catalog: true } }) : null;
  const prefs = body.prefs ?? {};
  const areas = (prefs.areas ?? []).map((a) => clip(a, 40)).filter(Boolean).slice(0, 10);
  const moveIn = prefs.moveIn && !Number.isNaN(Date.parse(prefs.moveIn)) ? new Date(prefs.moveIn) : null;
  const noteLine = [
    `${new Date().toISOString().slice(0, 10)} · Telegram აპი · ${KIND_LABEL[kind]}`,
    post ? `ბინა #${post.refNo}: ${headline(post, "ka")}` : "",
    message,
  ].filter(Boolean).join("\n");

  const or = [
    ...(username ? [{ messenger: username }] : []),
    ...(tgUserId ? [{ messenger: `tg:${tgUserId}` }] : []),
    ...(digits.length >= 9 ? [{ phone: { contains: digits.slice(-9) } }] : []),
  ];
  const existing = or.length ? await prisma.client.findFirst({ where: { OR: or }, orderBy: { createdAt: "desc" } }) : null;
  const dealType = post?.dealType ?? (prefs.deal === "sale" ? "იყიდება" : prefs.deal === "rent" ? "ქირავდება" : null);
  const client = existing
    ? await prisma.client.update({
        where: { id: existing.id },
        data: {
          notes: [noteLine, existing.notes].filter(Boolean).join("\n\n").slice(0, 8000),
          phone: existing.phone || phone || null,
          ...(existing.status === "closed_lost" ? { status: "searching" } : {}),
        },
      })
    : await prisma.client.create({
        data: {
          name,
          phone: phone || null,
          messenger: username ?? (tgUserId ? `tg:${tgUserId}` : null),
          language: lang,
          dealType,
          budgetMax: prefs.budgetMax && prefs.budgetMax > 0 ? Math.min(prefs.budgetMax, 1e9) : null,
          roomsMin: prefs.roomsMin && prefs.roomsMin > 0 ? Math.min(Math.round(prefs.roomsMin), 20) : null,
          areas: areas.length ? areas.join(", ") : null,
          moveIn,
          notes: noteLine,
          status: "new",
          assignedToId: post?.createdById ?? null,
        },
      });

  await prisma.catalogLead.create({
    data: {
      kind,
      postId: post?.id ?? null,
      clientId: client.id,
      name,
      phone: phone || null,
      tgUserId,
      tgUsername: username,
      lang,
      message: message || null,
      ...(kind === "search"
        ? {
            prefs: JSON.stringify({ deal: ["rent", "sale", "daily"].includes(prefs.deal ?? "") ? prefs.deal : undefined, budgetMax: prefs.budgetMax && prefs.budgetMax > 0 ? prefs.budgetMax : undefined, roomsMin: prefs.roomsMin && prefs.roomsMin > 0 ? Math.round(prefs.roomsMin) : undefined, areas, pets: prefs.pets || undefined }),
            // Only a Telegram user who allowed the bot to write can get alerts.
            alerts: Boolean(body.alerts && tgUserId),
          }
        : {}),
    },
  });

  // CRM bell for admins and the agent who owns the listing.
  const users = await prisma.user.findMany({ where: { active: true, OR: [{ role: "admin" }, ...(post ? [{ id: post.createdById }] : [])] }, select: { id: true } });
  if (users.length) {
    await prisma.notification.createMany({
      data: users.map((u) => ({ userId: u.id, type: "match", title: `${KIND_LABEL[kind]}: ${name}`, body: post ? `#${post.refNo} ${headline(post, "ka")}` : message.slice(0, 140) || null, link: `/clients/${client.id}` })),
    });
  }

  const contact = [username, phone].filter(Boolean).join(" · ") || "Telegram (ნომრის გარეშე)";
  const lines = [
    `<b>${KIND_LABEL[kind]}</b> — Telegram აპიდან`,
    `👤 ${name} · ${contact}`,
    post ? `🏠 #${post.refNo} ${headline(post, "ka")} · ${priceText(post.price, post.currency, dealKind(post.dealType), "ka")}` : "",
    kind === "search"
      ? [prefs.deal ? DEAL_LABEL[prefs.deal === "sale" ? "sale" : "rent"].ka : "", prefs.budgetMax ? `ბიუჯეტი $${prefs.budgetMax}` : "", prefs.roomsMin ? `${prefs.roomsMin}+ ოთახი` : "", areas.join(", "), moveIn ? `შესვლა ${moveIn.toISOString().slice(0, 10)}` : ""].filter(Boolean).join(" · ")
      : "",
    message ? `💬 ${message}` : "",
    kind === "search" && body.alerts && tgUserId ? "🔔 ახალ ბინებზე შეტყობინებები ჩართო" : "",
    `🌐 ენა: ${lang}`,
  ].filter(Boolean);
  await notifyRecipients(lines.join("\n"));

  return Response.json({ ok: true });
}
