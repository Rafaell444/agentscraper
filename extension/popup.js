const $ = (id) => document.getElementById(id);
const DEFAULTS = { crmUrl: "https://agenturicrm.vercel.app", token: "", auto: false, intervalSec: 60, dailyCap: 400 };

async function load() {
  const s = { ...DEFAULTS, ...(await chrome.storage.local.get(null)) };
  $("crmUrl").value = s.crmUrl;
  $("token").value = s.token;
  $("auto").checked = Boolean(s.auto);
  $("intervalSec").value = String(s.intervalSec);
  $("dailyCap").value = String(s.dailyCap);
  const stats = s.stats?.day === new Date().toISOString().slice(0, 10) ? s.stats : { found: 0, tried: 0 };
  $("found").textContent = stats.found;
  $("tried").textContent = stats.tried;
  $("log").innerHTML = "";
  for (const line of s.log ?? []) {
    const li = document.createElement("li");
    li.textContent = line;
    $("log").appendChild(li);
  }
  if (s.token) check();
}

async function check() {
  const me = await chrome.runtime.sendMessage({ type: "me" }).catch(() => null);
  if (me?.ok) {
    $("who").className = "muted ok";
    $("who").textContent = `✓ დაკავშირებულია: ${me.name} · დღეს ${me.today} ნომერი`;
    $("waiting").textContent = me.waiting;
  } else {
    $("who").className = "muted err";
    $("who").textContent = "✗ " + (me?.error || "CRM-თან კავშირი ვერ მოხერხდა");
  }
}

$("save").addEventListener("click", async () => {
  const crmUrl = $("crmUrl").value.trim().replace(/\/+$/, "") || DEFAULTS.crmUrl;
  // Chrome must allow the extension to talk to this CRM address (asked once).
  try {
    const origin = new URL(crmUrl).origin + "/*";
    const has = await chrome.permissions.contains({ origins: [origin] });
    if (!has) await chrome.permissions.request({ origins: [origin] });
  } catch {
    $("who").className = "muted err";
    $("who").textContent = "✗ მისამართი არასწორია";
    return;
  }
  await chrome.storage.local.set({ crmUrl, token: $("token").value.trim() });
  await chrome.runtime.sendMessage({ type: "settingsChanged" });
  check();
});

$("auto").addEventListener("change", async () => {
  await chrome.storage.local.set({ auto: $("auto").checked });
  await chrome.runtime.sendMessage({ type: "settingsChanged" });
});
$("intervalSec").addEventListener("change", () => chrome.storage.local.set({ intervalSec: Number($("intervalSec").value) }));
$("dailyCap").addEventListener("change", () => chrome.storage.local.set({ dailyCap: Math.max(10, Number($("dailyCap").value) || 400) }));
$("runNow").addEventListener("click", async () => {
  $("runNow").disabled = true;
  $("runNow").textContent = "…";
  await chrome.runtime.sendMessage({ type: "runNow" });
  $("runNow").disabled = false;
  $("runNow").textContent = "ერთი ახლავე";
  load();
});

load();
