import { MetaWhatsAppProvider } from "./meta-whatsapp.provider";
import type { WhatsAppProvider } from "./whatsapp-provider";

/**
 * Il fornitore configurato su questo ambiente, o `null`: senza le chiavi di
 * Meta su Render (oggi, finché la società non è verificata) nessun messaggio
 * parte e in Notifiche la scheda WhatsApp dice "in arrivo".
 */
export function whatsAppProviderFromEnv(): WhatsAppProvider | null {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!token || !phoneNumberId) return null;
  return new MetaWhatsAppProvider(
    token,
    phoneNumberId,
    process.env.WHATSAPP_APP_SECRET?.trim() || null,
    process.env.WHATSAPP_GRAPH_VERSION?.trim() || "v23.0",
  );
}

/** Messaggi al giorno per tutto il sito: oltre si salta e lo vede l'admin. */
export function whatsAppDailyLimit(): number {
  const value = Number(process.env.WHATSAPP_DAILY_LIMIT);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 500;
}

/**
 * Prezzo di un messaggio consegnato, in milionesimi di euro, dalla rate card
 * EUR di Meta in vigore dal 1/10/2026 (riga Italy: utility e authentication
 * 0,0248 €). Da aggiornare quando Meta cambia i prezzi (primo giorno del
 * trimestre).
 */
export function whatsAppPriceMicroEur(category: string): number {
  if (category === "marketing") return 65_800;
  const raw =
    category === "authentication"
      ? process.env.WHATSAPP_PRICE_AUTHENTICATION_MICRO_EUR
      : process.env.WHATSAPP_PRICE_UTILITY_MICRO_EUR;
  const value = raw?.trim() ? Number(raw) : NaN;
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : 24_800;
}
