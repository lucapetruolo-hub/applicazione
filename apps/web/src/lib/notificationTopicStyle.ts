import { NOTIFICATION_TOPIC_INFO, notificationTopicOf, type NotificationTopic } from "@professionisti/shared";
import { brand, type IconName } from "@professionisti/ui";

/**
 * Icona e colore per argomento di notifica (docs/CHANGELOG.md §152):
 * usati nella tendina della campanella e nei popup, così a colpo d'occhio
 * si capisce di cosa si tratta (una richiesta, un messaggio...).
 */
export const NOTIFICATION_TOPIC_STYLE: Record<NotificationTopic, { icon: IconName; color: string; tint: string }> = {
  richieste: { icon: "file-text", color: brand.cianografiaScuro, tint: brand.cianografiaVelo },
  preventivi: { icon: "receipt-text", color: "#8a6417", tint: brand.ottoneVelo },
  lavori: { icon: "calendar", color: brand.verificato, tint: "#E4EEE4" },
  messaggi: { icon: "message-circle", color: brand.grafite, tint: brand.gesso },
  promemoria: { icon: "clock", color: "#8a6417", tint: brand.ottoneVelo },
  // Neutro: il colore lo decide il tono della singola notizia (vedi sotto).
  account: { icon: "shield", color: brand.grafite, tint: brand.gesso },
};

/**
 * "Account e sicurezza" mescola buone e cattive notizie: prima era tutto
 * rosso, anche "Stripe ha verificato la tua identità" (richiesta di Luca del
 * 12/11, docs/changelog/2026-11-12-notifiche-positive-verdi.md). Verde = fatto,
 * rosso = errore o misura da sistemare, il resto neutro.
 */
const ACCOUNT_GOOD = new Set([
  "STRIPE_ACCOUNT_ACTIVE",
  "PROFILE_VERIFIED",
  "ACCOUNT_REACTIVATED",
  "CONTENT_REPORT_REVERTED",
  "SUBSCRIPTION_FREE_MONTHS_STARTED",
  "SUBSCRIPTION_BONUS_MONTH",
  "SUBSCRIPTION_RENEWED",
  "SUBSCRIPTION_PAID",
]);
const ACCOUNT_BAD = new Set([
  "ACCOUNT_SUSPENDED",
  "ACCOUNT_CLOSURE_SCHEDULED",
  "ACCOUNT_CLOSED",
  "JOB_ISSUE_SANCTION",
  "CONTENT_REPORT_UPHELD",
  "PROFILE_VERIFICATION_REMOVED",
  "IDENTITY_VERIFICATION_DECLINED",
  "TAX_ID_INVALID",
  "STRIPE_ACCOUNT_RESTRICTED",
  "PAYOUT_IBAN_MISMATCH",
  "SUBSCRIPTION_PAYMENT_FAILED",
]);
const GOOD_STYLE = { icon: "shield-check" as IconName, color: brand.verificato, tint: brand.cianografiaVelo };
const BAD_STYLE = { icon: "shield" as IconName, color: brand.urgenza, tint: brand.urgenzaVelo };

/** Tono di una notifica di "Account e sicurezza": buona, cattiva o neutra. */
export function accountNotificationTone(type: string): "good" | "bad" | "neutral" {
  if (ACCOUNT_GOOD.has(type)) return "good";
  if (ACCOUNT_BAD.has(type)) return "bad";
  return "neutral";
}

const FALLBACK = { icon: "bell-ring" as IconName, color: brand.grafite70, tint: brand.gesso };

/** Titolo breve (l'argomento, dal punto di vista di chi riceve) + icona e colori. */
export function notificationTopicStyle(type: string, isProfessional: boolean): { title: string; icon: IconName; color: string; tint: string } {
  const topic = notificationTopicOf(type);
  if (!topic) return { title: "Notifica", ...FALLBACK };
  const info = NOTIFICATION_TOPIC_INFO[topic];
  const title = (isProfessional ? info.professional : info.client).label;
  if (topic === "account") {
    const tone = accountNotificationTone(type);
    if (tone === "good") return { title, ...GOOD_STYLE };
    if (tone === "bad") return { title, ...BAD_STYLE };
  }
  return { title, ...NOTIFICATION_TOPIC_STYLE[topic] };
}
