import { createHash } from "node:crypto";

/**
 * Dispositivo da cui si entra (docs/CHANGELOG.md §289): un codice casuale
 * che il sito tiene nel browser e manda nell'intestazione `X-Device-Id`, più
 * il browser per l'email "Nuovo accesso". Senza codice valido il controllo
 * del dispositivo nuovo non parte.
 */
export type LoginDeviceInfo = { id?: string; userAgent?: string };

const DEVICE_ID_PATTERN = /^[A-Za-z0-9-]{16,64}$/;

export function loginDeviceHash(device: LoginDeviceInfo | undefined): string | null {
  if (!device?.id || !DEVICE_ID_PATTERN.test(device.id)) return null;
  return createHash("sha256").update(device.id).digest("hex");
}

const BROWSERS: [RegExp, string][] = [
  [/Edg(A|iOS)?\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/SamsungBrowser\//, "Samsung Internet"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Safari\//, "Safari"],
];

const SYSTEMS: [RegExp, string][] = [
  [/iPhone/, "iPhone"],
  [/iPad/, "iPad"],
  [/Android/, "Android"],
  [/Windows/, "Windows"],
  [/Mac OS X|Macintosh/, "Mac"],
  [/CrOS/, "Chromebook"],
  [/Linux/, "Linux"],
];

/** "Chrome su Windows", "Safari su iPhone"; "un browser" se non si riconosce. */
export function loginDeviceLabel(userAgent: string | undefined): string {
  const ua = userAgent ?? "";
  const browser = BROWSERS.find(([pattern]) => pattern.test(ua))?.[1];
  const system = SYSTEMS.find(([pattern]) => pattern.test(ua))?.[1];
  if (browser && system) return `${browser} su ${system}`;
  if (system) return `un browser su ${system}`;
  return browser ?? "un browser";
}
