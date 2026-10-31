// The red page the extension opens when it stops and needs the agent.
const $ = (id) => document.getElementById(id);

const STEPS = {
  login: ["დააჭირე „MyHome-ის გახსნა“.", "შედი შენს MyHome ანგარიშზე (ამავე Chrome-ში).", "დაბრუნდი აქ და დააჭირე „ისევ ჩართვა“."],
  blocked: ["MyHome-მა რამდენჯერმე არ აჩვენა ნომერი — ალბათ ცოტა ხნით შეგვზღუდა.", "გახსენი MyHome და ნახე, ხომ არ ითხოვს რამეს (შესვლა, შემოწმება).", "30–60 წუთის შემდეგ დააჭირე „ისევ ჩართვა“."],
  key: ["გახსენი CRM → „გაფართოება“ და დააკოპირე გასაღები.", "დააჭირე გაფართოების ხატულას Chrome-ში და ჩასვი გასაღები.", "დააჭირე „დაკავშირება“ — ავტომატური რეჟიმი თავად ჩაირთვება."],
  site: ["დააჭირე „საიტის გახსნა“ და დაელოდე, სანამ გვერდი ჩაიტვირთება (შეიძლება შემოწმება მოითხოვოს).", "დაბრუნდი აქ და დააჭირე „ისევ ჩართვა“."],
};

async function show() {
  const { alert } = await chrome.storage.local.get("alert");
  if (!alert) {
    $("reason").textContent = "ყველაფერი რიგზეა — გაფართოება მუშაობს.";
    $("resume").hidden = true;
    $("open").hidden = true;
    return;
  }
  $("reason").textContent = alert.reason;
  $("when").textContent = new Date(alert.at).toLocaleString("ka-GE", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "long" });
  for (const step of STEPS[alert.kind] ?? STEPS.blocked) {
    const li = document.createElement("li");
    li.textContent = step;
    $("steps").appendChild(li);
  }
  if (alert.kind === "key") $("open").hidden = true;
  if (alert.kind === "site" && alert.url) {
    $("open").href = alert.url;
    $("open").textContent = "საიტის გახსნა";
  }
}

$("resume").addEventListener("click", async () => {
  $("resume").disabled = true;
  await chrome.runtime.sendMessage({ type: "resume" });
  $("done").hidden = false;
  setTimeout(() => window.close(), 3000);
});

show();
