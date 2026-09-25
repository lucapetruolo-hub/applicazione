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
  account: { icon: "shield", color: brand.urgenza, tint: brand.urgenzaVelo },
};

const FALLBACK = { icon: "bell-ring" as IconName, color: brand.grafite70, tint: brand.gesso };

/** Titolo breve (l'argomento, dal punto di vista di chi riceve) + icona e colori. */
export function notificationTopicStyle(type: string, isProfessional: boolean): { title: string; icon: IconName; color: string; tint: string } {
  const topic = notificationTopicOf(type);
  if (!topic) return { title: "Notifica", ...FALLBACK };
  const info = NOTIFICATION_TOPIC_INFO[topic];
  return { title: (isProfessional ? info.professional : info.client).label, ...NOTIFICATION_TOPIC_STYLE[topic] };
}
