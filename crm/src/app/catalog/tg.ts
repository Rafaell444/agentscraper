// Minimal typings for the Telegram Mini App API (telegram-web-app.js).
// Everything is optional: the catalog also runs as a normal web page.

export type TgWebApp = {
  initData: string;
  initDataUnsafe?: { start_param?: string; user?: { id?: number; first_name?: string; last_name?: string; language_code?: string } };
  colorScheme?: "light" | "dark";
  version?: string;
  ready: () => void;
  expand: () => void;
  enableClosingConfirmation?: () => void;
  disableVerticalSwipes?: () => void;
  isVersionAtLeast?: (v: string) => boolean;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  openTelegramLink?: (url: string) => void;
  openLink?: (url: string) => void;
  requestWriteAccess?: (cb: (ok: boolean) => void) => void;
  /** Bot API 8.0: share a message prepared by the bot (savePreparedInlineMessage). */
  shareMessage?: (id: string, cb?: (sent: boolean) => void) => void;
  requestContact?: (cb: (ok: boolean, res?: { responseUnsafe?: { contact?: { phone_number?: string } } }) => void) => void;
  BackButton?: { show: () => void; hide: () => void; onClick: (cb: () => void) => void; offClick: (cb: () => void) => void };
  HapticFeedback?: { impactOccurred: (s: "light" | "medium") => void; notificationOccurred: (s: "success" | "error") => void; selectionChanged: () => void };
  CloudStorage?: { getItem: (key: string, cb: (err: unknown, value?: string) => void) => void; setItem: (key: string, value: string) => void };
};

export function tg(): TgWebApp | null {
  if (typeof window === "undefined") return null;
  const app = (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;
  // The script defines WebApp outside Telegram too; initData is empty there.
  return app && app.initData ? app : null;
}

export function haptic(kind: "tap" | "select" | "success" | "error") {
  const h = tg()?.HapticFeedback;
  if (!h) return;
  try {
    if (kind === "tap") h.impactOccurred("light");
    else if (kind === "select") h.selectionChanged();
    else h.notificationOccurred(kind);
  } catch {
    // older clients
  }
}

export function openTelegram(url: string) {
  const app = tg();
  if (app?.openTelegramLink && url.startsWith("https://t.me/")) app.openTelegramLink(url);
  else window.open(url, "_blank", "noopener");
}
