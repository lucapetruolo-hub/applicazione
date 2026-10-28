import parsePhoneNumber from "libphonenumber-js/max";
import {
  WHATSAPP_QUIET_END_HOUR,
  WHATSAPP_QUIET_START_HOUR,
  wallClockNow,
} from "@professionisti/shared";

/**
 * Regole pure dei messaggi WhatsApp (docs/changelog/2026-10-28-promemoria-whatsapp.md),
 * separate dal servizio per provarle senza database.
 */

/** "+39 3331234567" → "393331234567" (il formato che vuole Meta). */
export function whatsappNumber(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** Un numero a cui può arrivare WhatsApp: cellulare (o "fisso o cellulare" dove non si distingue). */
export function isMobileNumber(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const parsed = parsePhoneNumber(phone.startsWith("+") ? phone : `+${phone}`);
  if (!parsed || !parsed.isValid()) return false;
  const type = parsed.getType();
  return type === "MOBILE" || type === "FIXED_LINE_OR_MOBILE";
}

/** "+39 333 ••• 4567": il numero a cui è partito il codice, senza scriverlo per intero. */
export function maskedPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const prefix = phone.match(/^\+\d{1,4}/)?.[0] ?? "";
  const national = digits.slice(prefix.length - 1);
  if (national.length < 6) return phone;
  return `${prefix} ${national.slice(0, 3)} ••• ${national.slice(-4)}`.trim();
}

/** Ora italiana di adesso nelle ore di silenzio (21-8)? */
export function inQuietHours(now: Date = new Date()): boolean {
  const hour = wallClockNow(now).getUTCHours();
  return hour >= WHATSAPP_QUIET_START_HOUR || hour < WHATSAPP_QUIET_END_HOUR;
}

/** Primo momento utile per un messaggio che può aspettare: adesso, o le 8 del mattino italiane. */
export function nextSendTime(now: Date = new Date()): Date {
  if (!inQuietHours(now)) return now;
  const wall = wallClockNow(now);
  const target = new Date(wall);
  target.setUTCHours(WHATSAPP_QUIET_END_HOUR, 0, 0, 0);
  if (wall.getUTCHours() >= WHATSAPP_QUIET_START_HOUR)
    target.setUTCDate(target.getUTCDate() + 1);
  return new Date(now.getTime() + (target.getTime() - wall.getTime()));
}

/** L'istante vero di un orario di parete (`Booking.scheduledAt`, §287). */
export function wallClockToInstant(
  wallClock: Date,
  now: Date = new Date(),
): Date {
  return new Date(
    now.getTime() + (wallClock.getTime() - wallClockNow(now).getTime()),
  );
}

/** Mezzanotte italiana di oggi come istante vero, per i tetti del giorno. */
export function startOfItalianDay(now: Date = new Date()): Date {
  const wall = wallClockNow(now);
  const midnight = new Date(wall);
  midnight.setUTCHours(0, 0, 0, 0);
  return new Date(now.getTime() - (wall.getTime() - midnight.getTime()));
}

/** Testo che spegne i promemoria quando qualcuno lo scrive in risposta (oltre al pulsante). */
export function isStopRequest(
  text: string | null,
  buttonPayload: string | null,
): boolean {
  if (buttonPayload && buttonPayload.trim().toUpperCase() === "STOP")
    return true;
  const normalized = (text ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.!]+$/, "");
  return [
    "stop",
    "basta",
    "non ricevere piu",
    "annulla iscrizione",
    "disiscrivimi",
    "cancellami",
  ].includes(normalized);
}

/** Avanza lo stato solo in avanti: un "consegnato" arrivato dopo il "letto" non lo riporta indietro. */
const ORDER = { QUEUED: 0, SENT: 1, DELIVERED: 2, READ: 3 } as const;
export function shouldApplyStatus(
  current: string,
  next: "SENT" | "DELIVERED" | "READ" | "FAILED",
): boolean {
  if (current === "SKIPPED") return false;
  if (next === "FAILED")
    return (
      current !== "DELIVERED" && current !== "READ" && current !== "FAILED"
    );
  if (current === "FAILED") return false;
  const from = ORDER[current as keyof typeof ORDER] ?? 0;
  return ORDER[next] > from;
}
