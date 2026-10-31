// Background worker: in auto mode it takes the next MyHome listing without a
// number from the CRM, opens it in one pinned background tab, asks content.js
// to press "ნომრის ნახვა", and saves the answer.  Listings follow each other
// with a 20-second pause, up to a daily cap; it stops by itself if
// MyHome asks for a login or keeps refusing.

// Auto mode is on by default: opening Chrome is enough for numbers to keep coming.
const DEFAULTS = { crmUrl: "https://agenturicrm.vercel.app", token: "", auto: true, intervalSec: 20, dailyCap: 1500 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = () => new Date().toISOString().slice(0, 10);

async function settings() {
  return { ...DEFAULTS, ...(await chrome.storage.local.get(Object.keys(DEFAULTS))) };
}

async function state() {
  const s = await chrome.storage.local.get(["stats", "log", "nextAt", "busySince", "workerTab", "refusals"]);
  const stats = s.stats?.day === today() ? s.stats : { day: today(), found: 0, tried: 0 };
  return { stats, log: s.log ?? [], nextAt: s.nextAt ?? 0, busySince: s.busySince ?? 0, workerTab: s.workerTab ?? null, refusals: s.refusals ?? 0 };
}

async function api(path, init = {}) {
  const { crmUrl, token } = await settings();
  const response = await fetch(crmUrl.replace(/\/+$/, "") + path, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, ...(init.headers || {}) },
  });
  const json = await response.json().catch(() => ({}));
  if (response.status === 401) throw new Error("CRM: არასწორი გასაღები");
  return json;
}

/** "599123456" -> "599 12 34 56" */
function prettyPhone(phone) {
  return String(phone).split(/;\s*/).map((p) => (/^5\d{8}$/.test(p) ? p.replace(/^(\d{3})(\d{2})(\d{2})(\d{2})$/, "$1 $2 $3 $4") : p)).join(", ");
}

const PROBLEMS = {
  blocked: "MyHome-მა ნომერი არ აჩვენა",
  login: "MyHome შესვლას ითხოვს",
  error: "გვერდი ვერ ჩაიტვირთა",
};

async function addLog(line) {
  const { log } = await state();
  const entry = new Date().toLocaleTimeString("ka-GE", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) + " " + line;
  await chrome.storage.local.set({ log: [entry, ...log].slice(0, 30) });
}

async function badge() {
  const { auto } = await settings();
  const { stats } = await state();
  const { alert } = await chrome.storage.local.get("alert");
  if (alert) {
    await chrome.action.setBadgeBackgroundColor({ color: "#dc2626" });
    await chrome.action.setBadgeText({ text: "!" });
    return;
  }
  await chrome.action.setBadgeBackgroundColor({ color: auto ? "#1d4f8c" : "#6b7280" });
  await chrome.action.setBadgeText({ text: stats.found ? String(stats.found) : auto ? "on" : "" });
}

/** The red page in front of the agent, focused (and flashing in the taskbar). */
async function openAlertTab() {
  const url = chrome.runtime.getURL("alert.html");
  const [existing] = await chrome.tabs.query({ url });
  const tab = existing ? await chrome.tabs.update(existing.id, { active: true }) : await chrome.tabs.create({ url, active: true });
  if (tab?.windowId != null) await chrome.windows.update(tab.windowId, { focused: true, drawAttention: true }).catch(() => undefined);
}

/**
 * Something needs the agent: a red page that opens by itself (again at every
 * Chrome start until solved), a red "!" on the icon, a notification that
 * stays until clicked, and a Telegram message from the CRM.
 */
async function alertUser(reason, kind, url = "") {
  await chrome.storage.local.set({ alert: { reason, kind, url, at: Date.now() } });
  await addLog("🔴 " + reason);
  await badge();
  chrome.notifications?.create("alert", {
    type: "basic",
    iconUrl: "icons/128.png",
    title: "🔴 Tbilisi Home — საჭიროა შენი ჩარევა",
    message: reason,
    priority: 2,
    requireInteraction: true,
    buttons: [{ title: "გახსნა" }],
  });
  await openAlertTab().catch(() => undefined);
  if (kind !== "key") api("/api/ext/alert", { method: "POST", body: JSON.stringify({ reason }) }).catch(() => undefined);
}

async function stopAuto(reason, kind) {
  await chrome.storage.local.set({ auto: false });
  await alertUser(reason, kind);
}

async function resume() {
  await chrome.storage.local.set({ alert: null, auto: true, nextAt: 0, refusals: 0, busySince: 0 });
  chrome.notifications?.clear("alert");
  await addLog("▶ ისევ ჩართულია");
  await badge();
  relayRun();
}

function waitForLoad(tabId, timeoutMs) {
  return new Promise((resolve) => {
    const done = (ok) => {
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(timer);
      resolve(ok);
    };
    const listener = (id, info) => {
      if (id === tabId && info.status === "complete") done(true);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    chrome.tabs.onUpdated.addListener(listener);
  });
}

/** Ask content.js to reveal the number (it may need a moment to load). */
async function askReveal(tabId) {
  for (let i = 0; i < 10; i++) {
    try {
      const ping = await chrome.tabs.sendMessage(tabId, { type: "ping" });
      if (ping?.ok) return await chrome.tabs.sendMessage(tabId, { type: "reveal" });
    } catch {
      // content script not ready yet
    }
    await sleep(1500);
  }
  return { status: "error", detail: "page did not load" };
}

async function workerTab(url) {
  const { workerTab: id } = await state();
  if (id != null) {
    try {
      await chrome.tabs.get(id);
      await chrome.tabs.update(id, { url, active: false });
      return id;
    } catch {
      // the agent closed it
    }
  }
  const tab = await chrome.tabs.create({ url, active: false, pinned: true });
  await chrome.storage.local.set({ workerTab: tab.id });
  return tab.id;
}

/** One listing: open it, press "show number", save the answer. Returns "stop" when the agent is needed. */
async function processItem(item) {
  const tabId = await workerTab(item.url);
  await waitForLoad(tabId, 45_000);
  const result = await askReveal(tabId);
  const saved = await api("/api/ext/result", { method: "POST", body: JSON.stringify({ listingId: item.id, url: item.url, phone: result.phone, status: result.status, cadastral: result.cadastral }) });
  const st = await state();
  const stats = { ...st.stats, tried: st.stats.tried + 1, found: st.stats.found + (saved?.phone ? 1 : 0) };
  const refusals = result.status === "blocked" ? st.refusals + 1 : 0;
  await chrome.storage.local.set({ stats, refusals, queueEmptyAt: 0, busySince: Date.now(), lastRunAt: Date.now() });
  const what = item.label || "MyHome განცხადება";
  await addLog(
    saved?.phone
      ? "✓ " + prettyPhone(saved.phone) + " — " + what + (item.owner ? " (მესაკუთრე)" : "") + (saved.cadastral ? " · ს/კ " + saved.cadastral : "")
      : result.status === "none"
        ? "— " + what + ": ნომერი არ აქვს"
        : "⚠ " + what + ": " + (PROBLEMS[result.status] || "ვერ მოხერხდა"),
  );
  await badge();
  const found = Boolean(saved?.phone);
  if (result.status === "login") {
    // MyHome logged us out: most likely too fast, so the pause grows one step and that pace is remembered as failed.
    const { intervalSec } = await settings();
    const { paceFails = {} } = await chrome.storage.local.get("paceFails");
    const slower = PACE_STEPS.find((step) => step > intervalSec) ?? PACE_STEPS[PACE_STEPS.length - 1];
    await chrome.storage.local.set({ intervalSec: slower, paceOk: 0, paceFails: { ...paceFails, [intervalSec]: Date.now() } });
    await stopAuto(`MyHome შესვლას ითხოვს — ნომრების მოტანა გაჩერდა. პაუზა გავზარდე: ახლა ${paceText(slower)}.`, "login");
    return { stop: true, login: true, found };
  }
  if (refusals >= 3) {
    await stopAuto("MyHome ზედიზედ 3-ჯერ არ აჩვენა ნომერი — ნომრების მოტანა გაჩერდა.", "blocked");
    return { stop: true, login: false, found };
  }
  await maybeSpeedUp();
  return { stop: false, login: false, found };
}

// Pause choices in seconds; a MyHome logout moves to the next, slower one.
const PACE_STEPS = [10, 15, 20, 30, 45, 60, 90, 120];
// After this many listings without a logout, one step faster is tried...
const SPEED_UP_AFTER = 300;
// ...but never a pace that logged us out in the last 3 days.
const FAIL_MEMORY_MS = 3 * 86400_000;

const paceText = (sec) => (sec >= 60 ? sec / 60 + " წუთი" : sec + " წამი");

/** Probe for the shortest pause MyHome accepts: one step faster after a long clean stretch. */
async function maybeSpeedUp() {
  const { paceOk = 0, paceFails = {} } = await chrome.storage.local.get(["paceOk", "paceFails"]);
  const { intervalSec } = await settings();
  if (paceOk + 1 < SPEED_UP_AFTER) return chrome.storage.local.set({ paceOk: paceOk + 1 });
  const faster = [...PACE_STEPS].reverse().find((step) => step < intervalSec);
  const failedRecently = faster != null && Date.now() - (paceFails[faster] ?? 0) < FAIL_MEMORY_MS;
  await chrome.storage.local.set({ paceOk: 0, ...(faster != null && !failedRecently ? { intervalSec: faster } : {}) });
  if (faster != null && !failedRecently) await addLog(`⏩ ${SPEED_UP_AFTER} განცხადება გამოყვანის გარეშე — პაუზას ვცდი ${paceText(faster)}`);
}

// One batch runs up to 4 minutes, then the next alarm tick carries on.
const BATCH_MS = 4 * 60_000;

/** Listings from the queue one after another, a short pause (the chosen pace) between them. */
async function runOne(force = false) {
  const cfg = await settings();
  const st = await state();
  if (!cfg.token) return;
  if (!force && (!cfg.auto || Date.now() < st.nextAt)) return;
  if (st.busySince && Date.now() - st.busySince < 3 * 60_000) return; // another run is still going
  if (st.stats.tried >= cfg.dailyCap) {
    await chrome.storage.local.set({ nextAt: Date.now() + 30 * 60_000 });
    return;
  }
  await chrome.storage.local.set({ busySince: Date.now() });
  const started = Date.now();
  const run = { pace: cfg.intervalSec, tried: 0, found: 0, loggedOut: false };
  let tabId = null;
  let wait = cfg.intervalSec * 1000;
  try {
    batch: while (Date.now() - started < BATCH_MS) {
      const { items = [] } = await api("/api/ext/queue?limit=" + (force ? 1 : 5));
      if (!items.length) {
        await addLog("ყველა ნომერი მოტანილია — ახლებს 10 წუთში შევამოწმებ");
        await chrome.storage.local.set({ queueEmptyAt: Date.now() });
        wait = 10 * 60_000;
        break;
      }
      for (const item of items) {
        const now = await settings();
        if (!force && !now.auto) break batch;
        if ((await state()).stats.tried >= now.dailyCap) break batch;
        const done = await processItem(item);
        run.tried += 1;
        if (done.found) run.found += 1;
        if (done.login) run.loggedOut = true;
        if (done.stop) break batch;
        // A sped-up pace starts a new analytics row.
        if ((await settings()).intervalSec !== run.pace) break batch;
        tabId = (await state()).workerTab;
        // Pause ±30% so it does not tick like a clock.
        await sleep(now.intervalSec * 1000 * (0.7 + Math.random() * 0.6));
      }
      if (force) break;
    }
  } catch (error) {
    await addLog("⚠ " + (String(error?.message).includes("გასაღები") ? error.message : "CRM-თან კავშირი ვერ მოხერხდა (ინტერნეტი?)"));
    if (String(error?.message).includes("გასაღები")) await stopAuto("CRM-ის გასაღები არასწორია — გაფართოება CRM-ს ვეღარ უკავშირდება.", "key");
  } finally {
    // Free the tab's memory until the next batch; the page says what this tab is.
    if (tabId != null) chrome.tabs.update(tabId, { url: chrome.runtime.getURL("worker.html") }).catch(() => undefined);
    const { nextAt } = await state();
    await chrome.storage.local.set({ busySince: 0, lastRunAt: Date.now(), nextAt: Math.max(nextAt, Date.now() + Math.min(wait, 10 * 60_000)) });
    await badge();
    // Pace analytics: how many listings at which pause, and whether MyHome logged us out.
    if (run.tried) {
      const seconds = Math.round((Date.now() - started) / 1000);
      api("/api/ext/pace", { method: "POST", body: JSON.stringify({ ...run, seconds }) }).catch(() => undefined);
    }
  }
}

// ---- Browser relay: pages the collector could not download (the site blocks
// GitHub's servers) come from here, at Chrome start and every 30 minutes. ----

async function relayRun() {
  const cfg = await settings();
  if (!cfg.token) return;
  const s = await chrome.storage.local.get(["relayBusySince", "relayStats"]);
  if (s.relayBusySince && Date.now() - s.relayBusySince < 15 * 60_000) return;
  await chrome.storage.local.set({ relayBusySince: Date.now(), relayLastRun: Date.now() });
  const stats = s.relayStats?.day === today() ? s.relayStats : { day: today(), pages: 0 };
  let sent = 0;
  const hosts = {}; // host -> { ok, failed }
  try {
    // Several rounds: the collector asks for detail pages (numbers) after it reads the result pages.
    for (let round = 0; round < 3; round++) {
      const { urls = [] } = await api("/api/ext/relay?limit=40");
      if (!urls.length) break;
      for (const url of urls) {
        try {
          const response = await fetch(url, { credentials: "include", cache: "no-store" });
          const html = await response.text();
          const host = new URL(url).hostname;
          hosts[host] ??= { ok: 0, failed: 0, gone: 0 };
          if (response.status === 404 || response.status === 410) {
            // The listing was deleted on the site: tell the CRM so it is not asked for again.
            await api("/api/ext/relay", { method: "POST", body: JSON.stringify({ url, gone: true }) });
            hosts[host].gone += 1;
            continue;
          }
          if (!response.ok || /<title>\s*Just a moment/i.test(html)) {
            hosts[host].failed += 1;
            await addLog("⚠ " + host + " გვერდს არ გვაძლევს (" + response.status + ")");
            continue;
          }
          const saved = await api("/api/ext/relay", { method: "POST", body: JSON.stringify({ url, html }) });
          if (saved?.ok) sent += 1;
          hosts[host].ok += 1;
        } catch {
          // one page failing does not stop the rest
        }
        await sleep(1200 + Math.random() * 1500);
      }
      // Ask the CRM to process them now; the next round picks up what that run asks for.
      await api("/api/ext/relay/done", { method: "POST", body: "{}" });
      if (round < 2) await sleep(4 * 60_000);
    }
  } catch (error) {
    await addLog("⚠ ss.ge / binebi: CRM-თან კავშირი ვერ მოხერხდა");
  } finally {
    stats.pages += sent;
    await chrome.storage.local.set({ relayBusySince: 0, relayStats: stats });
    for (const [host, h] of Object.entries(hosts)) {
      if (h.gone) await addLog("— " + host.replace(/^(www|home)\./, "") + ": " + h.gone + " განცხადება საიტიდან წაშლილია, გამოვტოვე");
    }
    if (sent) await addLog("⇅ " + Object.keys(hosts).filter((h) => hosts[h].ok).map((h) => h.replace(/^(www|home)\./, "")).join(", ") + " — " + sent + " გვერდი გადაეცა CRM-ს");
    // A site that refuses even this browser usually wants a one-time check in a normal tab.
    const stuck = Object.entries(hosts).find(([, h]) => h.failed >= 3 && !h.ok);
    const { alert, siteAlertAt = 0 } = await chrome.storage.local.get(["alert", "siteAlertAt"]);
    if (stuck && !alert && Date.now() - siteAlertAt > 6 * 3600_000) {
      await chrome.storage.local.set({ siteAlertAt: Date.now() });
      await alertUser(stuck[0] + " შენს Chrome-საც აღარ აძლევს გვერდებს — განცხადებები ამ საიტიდან არ მოდის.", "site", "https://" + stuck[0] + "/");
    }
  }
}

function schedule() {
  chrome.alarms.create("tick", { periodInMinutes: 0.5 });
  chrome.alarms.create("relay", { delayInMinutes: 0.2, periodInMinutes: 30 });
}

chrome.runtime.onInstalled.addListener(async () => {
  schedule();
  const { intervalSec, dailyCap } = await chrome.storage.local.get(["intervalSec", "dailyCap"]);
  // 1 s got agents logged out of MyHome: anything faster than 20 s moves to 20 s.
  if (intervalSec == null || intervalSec < 20) await chrome.storage.local.set({ intervalSec: DEFAULTS.intervalSec });
  if (dailyCap === 400) await chrome.storage.local.set({ dailyCap: DEFAULTS.dailyCap });
});
// Opening Chrome: catch up at once (relay right away; numbers resume on the next tick).
chrome.runtime.onStartup.addListener(async () => {
  schedule();
  await chrome.storage.local.set({ nextAt: 0, busySince: 0, relayBusySince: 0 });
  // Still waiting for the agent: show the red page again right away.
  const { alert } = await chrome.storage.local.get("alert");
  await badge();
  if (alert) await openAlertTab().catch(() => undefined);
});
chrome.notifications?.onClicked.addListener((id) => id === "alert" && openAlertTab());
chrome.notifications?.onButtonClicked.addListener((id) => id === "alert" && openAlertTab());
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "tick") runOne();
  if (alarm.name === "relay") relayRun();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message?.type === "save") {
      // The "📞 → CRM" button on a listing page.
      try {
        const saved = await api("/api/ext/result", { method: "POST", body: JSON.stringify({ url: message.url, phone: message.phone, status: message.status, cadastral: message.cadastral }) });
        if (saved?.phone && saved.ok) {
          const { stats } = await state();
          await chrome.storage.local.set({ stats: { ...stats, found: stats.found + 1 } });
          await addLog("✓ " + saved.phone + " (ხელით)");
          await badge();
        }
        sendResponse(saved);
      } catch (error) {
        sendResponse({ ok: false, error: String(error?.message || error) });
      }
    } else if (message?.type === "me") {
      try {
        sendResponse(await api("/api/ext/me"));
      } catch (error) {
        sendResponse({ ok: false, error: String(error?.message || error) });
      }
    } else if (message?.type === "runNow") {
      await Promise.all([runOne(true), relayRun()]);
      sendResponse({ ok: true });
    } else if (message?.type === "resume") {
      await resume();
      sendResponse({ ok: true });
    } else if (message?.type === "settingsChanged") {
      // A new key fixes a "wrong key" stop.
      const { alert } = await chrome.storage.local.get("alert");
      if (alert?.kind === "key") await resume();
      await chrome.storage.local.set({ nextAt: 0, refusals: 0 });
      relayRun();
      await badge();
      sendResponse({ ok: true });
    }
  })();
  return true;
});
