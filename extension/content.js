// On MyHome listing pages: press "ნომრის ნახვა" (for the background worker
// or the "📞 → CRM" button), read the number MyHome returns, report it.

const SHOW_TEXT = /ნომრის ნახვა|show number|показать номер/i;
const MOBILE = /(?:\+?995[\s-]*)?5\d{2}[\s-]?\d{2,3}[\s-]?\d{2,3}[\s-]?\d{0,3}/g;
let lastPhone = null;

window.addEventListener("message", (event) => {
  if (event.source !== window || event.data?.source !== "thc-phone") return;
  const data = event.data.payload?.data;
  if (data?.status === "SUCCESS") {
    lastPhone = [data.phone_number, data.additional_phone_number].filter(Boolean).join("; ");
  } else {
    lastPhone = { failed: String(data?.status || event.data.payload?.message || "refused") };
  }
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const listingId = () => location.pathname.match(/(\d{6,})\/?$/)?.[1] ?? null;
const visible = (el) => Boolean(el && el.offsetParent !== null && el.getClientRects().length);
const phonesIn = (text) => new Set((text.match(MOBILE) || []).map((p) => p.replace(/\D/g, "").replace(/^995/, "")).filter((p) => /^5\d{8}$/.test(p)));

function acceptCookies() {
  document.querySelector("#cookiescript_accept")?.click();
  document.querySelectorAll('[id^="cookiescript_injected"]').forEach((n) => n.remove());
}

// The popup MyHome puts over a listing when it wants an account ("… შექმენი, ან გამოიყენე არსებული ანგარიში").
const LOGIN_POPUP = /სრულყოფილად სარგებლობისთვის|გამოიყენე არსებული ანგარიში|use an existing account|существующий аккаунт/i;

function loginNeeded() {
  return (
    location.hostname.includes("auth.tnet.ge") ||
    Boolean(document.querySelector('input[name="Email"], input[name="Password"]')) ||
    LOGIN_POPUP.test(document.body?.innerText || "")
  );
}

const CADASTRAL = /\d{2}\.\d{2}\.\d{2}\.\d{3}\.\d{2,4}(?:\.\d{2,4}){0,2}/;

/** The full code once the page shows it after "ს/კ:" (masked as 01.7*** before the click). */
function shownCadastral() {
  return (document.body.innerText.match(/ს\/კ\s*:?\s*([\d.]+)/)?.[1] ?? "").match(CADASTRAL)?.[0] ?? "";
}

/** The listing's cadastral code (ს/კ): press MyHome's "კოდის ნახვა" when it is there, then read it. */
async function revealCadastral() {
  const button = [...document.querySelectorAll("span, button")].find((el) => /^კოდის ნახვა$/.test((el.textContent || "").trim()) && visible(el));
  if (button) {
    button.click();
    for (let i = 0; i < 10; i++) {
      await sleep(300);
      const code = shownCadastral();
      if (code) return code;
    }
  }
  const shown = shownCadastral();
  if (shown) return shown;
  // The page's own data has it too (MyHome masks it only on screen).
  return document.getElementById("__NEXT_DATA__")?.textContent.match(/"rs_code":"([\d.]+)"/)?.[1]?.match(CADASTRAL)?.[0] ?? "";
}

/** Press MyHome's "show number" (and "show code") buttons and wait for the answers. */
async function reveal() {
  const result = await revealPhone();
  if (result.status !== "login" && listingId()) result.cadastral = await revealCadastral().catch(() => "");
  return result;
}

async function revealPhone() {
  // A managed browser check ("Just a moment…") is left to Chrome to finish, as for any visitor.
  for (let i = 0; i < 25 && /just a moment/i.test(document.title); i++) await sleep(1000);
  if (/just a moment/i.test(document.title)) return { status: "blocked", detail: "browser check" };
  if (loginNeeded()) return { status: "login" };
  if (!listingId()) return { status: "error", detail: "not a listing page" };

  acceptCookies();
  await sleep(400);
  const before = phonesIn(document.body.innerText);
  const button = [...document.querySelectorAll("button")].find((b) => SHOW_TEXT.test(b.textContent || "") && visible(b));
  if (!button) {
    // Already shown, or the listing has no number / was removed.
    const shown = [...phonesIn(document.body.innerText)];
    return shown.length ? { status: "ok", phone: shown.join("; ") } : { status: "none" };
  }
  lastPhone = null;
  button.click();
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    if (typeof lastPhone === "string" && lastPhone) return { status: "ok", phone: lastPhone };
    if (lastPhone && typeof lastPhone === "object") return { status: loginNeeded() ? "login" : "blocked", detail: lastPhone.failed };
    if (loginNeeded()) return { status: "login" };
  }
  // No API answer seen: take a number that appeared on the page after the click.
  const added = [...phonesIn(document.body.innerText)].filter((p) => !before.has(p));
  if (added.length) return { status: "ok", phone: added.join("; ") };
  // The button was pressed but nothing came back: not "no number", so it is tried again later.
  return loginNeeded() ? { status: "login" } : { status: "error", detail: "no answer" };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "reveal") {
    reveal().then(sendResponse, (e) => sendResponse({ status: "error", detail: String(e) }));
    return true;
  }
  if (message?.type === "ping") sendResponse({ ok: true, listing: Boolean(listingId()) });
  return false;
});

// ---- "📞 → CRM" button on listing pages ----

function toast(text, ok = true) {
  let box = document.getElementById("thc-toast");
  if (!box) {
    box = document.createElement("div");
    box.id = "thc-toast";
    document.body.appendChild(box);
  }
  box.textContent = text;
  box.className = ok ? "thc-ok" : "thc-err";
  clearTimeout(box._t);
  box._t = setTimeout(() => box.remove(), 6000);
}

function addButton() {
  if (!listingId() || document.getElementById("thc-save")) return;
  const btn = document.createElement("button");
  btn.id = "thc-save";
  btn.type = "button";
  btn.innerHTML = '<img alt="" src="' + chrome.runtime.getURL("icons/48.png") + '"><span>📞 → CRM</span>';
  btn.title = "Tbilisi Home: ნომრის ნახვა და CRM-ში შენახვა";
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.querySelector("span").textContent = "…";
    const result = await reveal();
    const saved = await chrome.runtime.sendMessage({ type: "save", url: location.href, ...result }).catch(() => null);
    btn.disabled = false;
    btn.querySelector("span").textContent = "📞 → CRM";
    if (result.status !== "ok") toast(result.status === "login" ? "MyHome შესვლას ითხოვს" : result.status === "none" ? "ნომერი არ არის" : "ვერ მოხერხდა: " + (result.detail || result.status), false);
    else if (saved?.ok) toast("✓ " + result.phone + " — შენახულია CRM-ში");
    else toast(result.phone + " — " + (saved?.error === "not in CRM" ? "ეს განცხადება CRM-ში ჯერ არ არის" : "CRM-ში ვერ შეინახა (" + (saved?.error || "კავშირი") + ")"), false);
  });
  document.body.appendChild(btn);
}

addButton();
// MyHome is a single-page app: watch for navigation to another listing.
let lastPath = location.pathname;
setInterval(() => {
  if (location.pathname !== lastPath) {
    lastPath = location.pathname;
    document.getElementById("thc-save")?.remove();
    addButton();
  }
}, 1000);
