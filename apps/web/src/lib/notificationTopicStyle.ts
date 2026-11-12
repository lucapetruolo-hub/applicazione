import { NOTIFICATION_TOPIC_INFO, notificationTopicOf, type NotificationTopic } from "@professionisti/shared";
import { brand, type IconName } from "@professionisti/ui";
import { notificationCopy } from "./notificationCopy";

/**
 * Icona e colore per argomento di notifica (docs/CHANGELOG.md §152):
 * usati nella tendina della campanella e nei popup, così a colpo d'occhio
 * si capisce di cosa si tratta (una richiesta, un messaggio...).
 */
export const NOTIFICATION_TOPIC_STYLE: Record<NotificationTopic, { icon: IconName; color: string; tint: string }> = {
  richieste: { icon: "file-text", color: brand.cianografiaScuro, tint: brand.cianografiaVelo },
  preventivi: { icon: "receipt-text", color: "#8a6417", tint: brand.ottoneVelo },
  // Blu ardesia, non verde: il verde resta per le buone notizie (12/11).
  lavori: { icon: "calendar", color: brand.ardesia, tint: brand.ardesiaVelo },
  messaggi: { icon: "message-circle", color: brand.grafite, tint: brand.gesso },
  promemoria: { icon: "clock", color: "#8a6417", tint: brand.ottoneVelo },
  // Neutro: il colore lo decide il tono della singola notizia (vedi sotto).
  account: { icon: "shield", color: brand.grafite, tint: brand.gesso },
};

/**
 * Tono della singola notizia (richiesta di Luca del 12/11,
 * docs/changelog/2026-11-12-notifiche-positive-verdi.md): prima il colore era
 * solo quello dell'argomento, e "Account e sicurezza" era tutto rosso, anche
 * "Stripe ha verificato la tua identità". Verde = fatto, rosso = errore o
 * misura da sistemare, il resto col colore dell'argomento.
 *
 * Il tono viene dall'icona del testo (`notificationCopy`), che segue già la
 * notizia anche quando dipende dal payload: ✅ 🥳 🎁 👍 buona, ⚠️ ⛔ cattiva.
 * Un tipo nuovo prende il colore giusto scegliendo l'icona giusta.
 */
const GOOD_ICONS = new Set(["✅", "🥳", "🎁", "👍"]);
const BAD_ICONS = new Set(["⚠️", "⛔"]);
/** Cattive notizie con un'icona di argomento (🪪, 🏦, ↩️, ⏸️) invece di ⚠️. */
const BAD_TYPES = new Set(["IDENTITY_VERIFICATION_DECLINED", "JOB_PAYOUT_FAILED", "JOB_REFUND_REJECTED", "SUBSCRIPTION_PAUSED"]);

export type NotificationTone = "good" | "bad" | "neutral";

export function notificationTone(type: string, payload?: unknown): NotificationTone {
  if (BAD_TYPES.has(type)) return "bad";
  const { icon } = notificationCopy(type, payload);
  if (GOOD_ICONS.has(icon)) return "good";
  if (BAD_ICONS.has(icon)) return "bad";
  return "neutral";
}

const GOOD_COLORS = { color: brand.verificato, tint: brand.cianografiaVelo };
const BAD_COLORS = { color: brand.urgenza, tint: brand.urgenzaVelo };

const FALLBACK = { icon: "bell-ring" as IconName, color: brand.grafite70, tint: brand.gesso };

/** Titolo breve (l'argomento, dal punto di vista di chi riceve) + icona e colori. */
export function notificationTopicStyle(type: string, isProfessional: boolean, payload?: unknown): { title: string; icon: IconName; color: string; tint: string } {
  const topic = notificationTopicOf(type);
  if (!topic) return { title: "Notifica", ...FALLBACK };
  const info = NOTIFICATION_TOPIC_INFO[topic];
  const title = (isProfessional ? info.professional : info.client).label;
  const base = NOTIFICATION_TOPIC_STYLE[topic];
  const tone = notificationTone(type, payload);
  // Nell'account lo scudo prende la spunta quando la notizia è buona.
  if (tone === "good") return { title, ...base, ...GOOD_COLORS, icon: topic === "account" ? "shield-check" : base.icon };
  if (tone === "bad") return { title, ...base, ...BAD_COLORS };
  return { title, ...base };
}
