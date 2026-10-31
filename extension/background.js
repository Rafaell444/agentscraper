// Background worker: in auto mode it takes the next MyHome listing without a
// number from the CRM, opens it in one pinned background tab, asks content.js
// to press "ნომრის ნახვა", and saves the answer.  About one listing a minute,
// up to a daily cap; it stops by itself if MyHome asks for a login or keeps
// refusing.

const DEFAULTS = { crmUrl: "https://agenturicrm.vercel.app", token: "", auto: false, intervalSec: 60, dailyCap: 400 };
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

async function addLog(line) {
  const { log } = await state();
  const entry = new Date().toLocaleTimeString("ka-GE", { hour: "2-digit", minute: "2-digit" }) + " " + line;
  await chrome.storage.local.set({ log: [entry, ...log].slice(0, 30) });
}

async function badge() {
  const { auto } = await settings();
  const { stats } = await state();
  await chrome.action.setBadgeBackgroundColor({ color: auto ? "#1d4f8c" : "#6b7280" });
  await chrome.action.setBadgeText({ text: stats.found ? String(stats.found) : auto ? "on" : "" });
}

async function stopAuto(reason) {
  await chrome.storage.local.set({ auto: false });
  await addLog("⏸ " + reason);
  await badge();
  chrome.notifications?.create({ type: "basic", iconUrl: "icons/128.png", title: "Tbilisi Home — ავტომატური რეჟიმი გაჩერდა", message: reason });
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

/** One listing from the queue. */
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
  try {
    const queue = await api("/api/ext/queue?limit=1");
    const item = queue.items?.[0];
    if (!item) {
      await addLog("რიგი ცარიელია — 10 წუთში ვცდი თავიდან");
      await chrome.storage.local.set({ nextAt: Date.now() + 10 * 60_000 });
      return;
    }
    const tabId = await workerTab(item.url);
    await waitForLoad(tabId, 45_000);
    const result = await askReveal(tabId);
    const saved = await api("/api/ext/result", { method: "POST", body: JSON.stringify({ listingId: item.id, url: item.url, phone: result.phone, status: result.status }) });
    const stats = { ...st.stats, tried: st.stats.tried + 1, found: st.stats.found + (saved?.phone ? 1 : 0) };
    const refusals = result.status === "blocked" ? st.refusals + 1 : 0;
    await chrome.storage.local.set({ stats, refusals });
    await addLog(saved?.phone ? "✓ " + saved.phone : result.status === "none" ? "— ნომერი არ არის" : "⚠ " + result.status + (result.detail ? " (" + result.detail + ")" : ""));
    // Free the tab's memory until the next listing.
    chrome.tabs.update(tabId, { url: "about:blank" }).catch(() => undefined);
    if (result.status === "login") await stopAuto("MyHome შესვლას ითხოვს. შედი MyHome-ზე ამ Chrome-ში და ისევ ჩართე.");
    else if (refusals >= 3) await stopAuto("MyHome ზედიზედ 3-ჯერ არ აჩვენა ნომერი. სცადე მოგვიანებით ან ნელი ტემპით.");
  } catch (error) {
    await addLog("⚠ " + (error?.message || error));
    if (String(error?.message).includes("გასაღები")) await stopAuto("CRM-ის გასაღები არასწორია — შეამოწმე ფანჯარაში.");
  } finally {
    // Next listing after the chosen interval, ±30% so it does not tick like a clock.
    const jitter = 0.7 + Math.random() * 0.6;
    const { nextAt } = await state();
    await chrome.storage.local.set({ busySince: 0, nextAt: Math.max(nextAt, Date.now() + cfg.intervalSec * 1000 * jitter) });
    await badge();
  }
}

chrome.runtime.onInstalled.addListener(() => chrome.alarms.create("tick", { periodInMinutes: 0.5 }));
chrome.runtime.onStartup.addListener(() => chrome.alarms.create("tick", { periodInMinutes: 0.5 }));
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "tick") runOne();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message?.type === "save") {
      // The "📞 → CRM" button on a listing page.
      try {
        const saved = await api("/api/ext/result", { method: "POST", body: JSON.stringify({ url: message.url, phone: message.phone, status: message.status }) });
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
      await runOne(true);
      sendResponse({ ok: true });
    } else if (message?.type === "settingsChanged") {
      await chrome.storage.local.set({ nextAt: 0, refusals: 0 });
      await badge();
      sendResponse({ ok: true });
    }
  })();
  return true;
});
