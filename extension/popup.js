const $ = (id) => document.getElementById(id);
const DEFAULTS = { crmUrl: "https://agenturicrm.vercel.app", token: "", auto: true, intervalSec: 1, dailyCap: 1500 };
const today = () => new Date().toISOString().slice(0, 10);

function ago(ms) {
  const min = Math.round((Date.now() - ms) / 60_000);
  if (min < 1) return "ახლახან";
  if (min < 60) return `${min} წთ წინ`;
  return `${Math.round(min / 60)} სთ წინ`;
}

/** kind: ok (green), bad (red), off (grey). */
function setStatus(kind, title, sub) {
  $("status").className = "status " + kind;
  $("statusTitle").textContent = title;
  $("statusSub").textContent = sub || "";
}

function showLog(lines) {
  $("log").innerHTML = "";
  for (const line of lines.slice(0, 15)) {
    const [, time, text] = line.match(/^(\d{1,2}:\d{2})(?:\s*[AP]M)?\s+(.*)$/i) ?? [null, "", line];
    const li = document.createElement("li");
    const t = document.createElement("time");
    t.textContent = time;
    const span = document.createElement("span");
    span.textContent = text;
    span.className = /^[✓⇅▶]/.test(text) ? "good" : /^(⚠|🔴)/.test(text) ? "warn" : "";
    li.append(t, span);
    $("log").appendChild(li);
  }
  $("logEmpty").hidden = lines.length > 0;
}

function showConnect(show, s) {
  $("connect").hidden = !show;
  if (show) {
    $("token").value = s.token;
    $("crmUrl").value = s.crmUrl;
    // The address only matters for a test CRM; shown when changing an existing connection.
    document.querySelector(".crm-url").hidden = !s.token;
  }
}

async function load() {
  const s = { ...DEFAULTS, ...(await chrome.storage.local.get(null)) };
  const stats = s.stats?.day === today() ? s.stats : { found: 0, tried: 0 };
  $("auto").checked = Boolean(s.auto);
  $("intervalSec").value = String(s.intervalSec);
  $("dailyCap").value = String(s.dailyCap);
  $("found").textContent = stats.found;
  showLog(s.log ?? []);

  const connected = Boolean(s.token);
  $("autoWrap").hidden = !connected;
  $("numbers").hidden = !connected;
  $("activity").hidden = !connected;
  $("settings").hidden = !connected;
  $("alertOpen").hidden = !s.alert;
  showConnect(!connected, s);

  if (!connected) return setStatus("off", "ჯერ არ არის დაკავშირებული", "ერთი ნაბიჯი დარჩა — ჩასვი გასაღები ქვემოთ.");
  if (s.alert) return setStatus("bad", "გაჩერდა — საჭიროა შენი ჩარევა", s.alert.reason);
  if (!s.auto) setStatus("off", "გამორთულია", "ჩართე ზედა გადამრთველით.");
  else setStatus("ok", "მუშაობს", workingLine(s, stats));
  check(s, stats);
}

function workingLine(s, stats) {
  if (stats.tried >= s.dailyCap) return "დღის ლიმიტი შესრულდა — ხვალ გააგრძელებს.";
  if (s.queueEmptyAt) return "ყველა ნომერი მოტანილია — ახლებს ელოდება.";
  return s.lastRunAt ? `ბოლო შემოწმება ${ago(s.lastRunAt)}` : "პირველი ნომერი რამდენიმე წუთში მოვა.";
}

async function check(s) {
  const me = await chrome.runtime.sendMessage({ type: "me" }).catch(() => null);
  if (me?.ok) {
    $("waiting").textContent = me.waiting;
    $("whoSmall").textContent = `დაკავშირებულია: ${me.name}`;
    $("whoSmall").className = "note ok";
    if (s.auto && !s.alert && me.waiting === 0) setStatus("ok", "მუშაობს", "ყველა ნომერი მოტანილია — ახლებს ელოდება.");
  } else {
    const badKey = /401|გასაღები|bad key/i.test(String(me?.error));
    setStatus("bad", "CRM-თან კავშირი არ არის", badKey ? "გასაღები არასწორია — ჩასვი ახალი ქვემოთ." : "შეამოწმე ინტერნეტი. თავად ცდის თავიდან.");
    if (badKey) showConnect(true, s);
  }
}

$("save").addEventListener("click", async () => {
  const crmUrl = $("crmUrl").value.trim().replace(/\/+$/, "") || DEFAULTS.crmUrl;
  const token = $("token").value.trim();
  if (!/^[a-f0-9]{64}$/i.test(token)) {
    $("who").className = "note err";
    $("who").textContent = "ეს გასაღები არ ჰგავს სწორს — დააკოპირე მთლიანად CRM-ის გვერდიდან.";
    return;
  }
  // Chrome must allow the extension to talk to this CRM address (asked once).
  try {
    const origin = new URL(crmUrl).origin + "/*";
    const has = await chrome.permissions.contains({ origins: [origin] });
    if (!has) await chrome.permissions.request({ origins: [origin] });
  } catch {
    $("who").className = "note err";
    $("who").textContent = "CRM-ის მისამართი არასწორია.";
    return;
  }
  $("save").disabled = true;
  $("save").textContent = "ვამოწმებ…";
  await chrome.storage.local.set({ crmUrl, token, auto: true });
  await chrome.runtime.sendMessage({ type: "settingsChanged" });
  const me = await chrome.runtime.sendMessage({ type: "me" }).catch(() => null);
  $("save").disabled = false;
  $("save").textContent = "დაკავშირება";
  if (!me?.ok) {
    $("who").className = "note err";
    $("who").textContent = "✗ CRM-მა ეს გასაღები არ მიიღო. შეამოწმე და სცადე თავიდან.";
    return;
  }
  $("who").textContent = "";
  load();
});

$("auto").addEventListener("change", async () => {
  // Turning it back on after a stop also clears the red alert.
  if ($("auto").checked) await chrome.runtime.sendMessage({ type: "resume" });
  else await chrome.storage.local.set({ auto: false });
  await chrome.runtime.sendMessage({ type: "settingsChanged" });
  load();
});
$("alertOpen").addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("alert.html") }));
$("reconnect").addEventListener("click", async () => {
  showConnect(true, { ...DEFAULTS, ...(await chrome.storage.local.get(["token", "crmUrl"])) });
  $("token").focus();
});
$("intervalSec").addEventListener("change", () => chrome.storage.local.set({ intervalSec: Number($("intervalSec").value) }));
$("dailyCap").addEventListener("change", () => chrome.storage.local.set({ dailyCap: Math.max(10, Number($("dailyCap").value) || 1500) }));
$("runNow").addEventListener("click", async () => {
  $("runNow").disabled = true;
  $("runNow").textContent = "ვამოწმებ…";
  await chrome.runtime.sendMessage({ type: "runNow" });
  $("runNow").disabled = false;
  $("runNow").textContent = "ახლავე შემოწმება";
  load();
});

load();
