import { BRAND } from "@professionisti/shared";

/**
 * Nome, logo e colori di tutte le email (docs/CHANGELOG.md §185). Nome ed
 * email di assistenza arrivano da `BRAND` (`packages/shared/src/brand.ts`,
 * unico punto da toccare per cambiare marchio; per il mittente anche
 * `RESEND_FROM_EMAIL` su Render).
 * I colori sono gli stessi della palette "Vicinato" (`packages/ui/src/tokens.ts`),
 * scritti qui a mano perché l'API non dipende dal pacchetto UI.
 */
export const EMAIL_BRAND = {
  name: BRAND.name,
  /** Firma in fondo a ogni email. */
  signature: `Il team di ${BRAND.name}`,
  supportEmail: BRAND.supportEmail,
  colors: {
    background: "#FDEFE1",
    card: "#FFFFFF",
    text: "#2B2420",
    muted: "#6E6459",
    border: "#F0DCC0",
    primary: "#189A63",
    primaryDark: "#0E7A4C",
    primaryTint: "#DCF3E7",
    urgent: "#C8362B",
    urgentTint: "#FBEAE7",
  },
} as const;

/** Indirizzo pubblico del sito, per i link nelle email. */
export function frontendUrl(): string {
  return (process.env.FRONTEND_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

/**
 * Logo in PNG (molti programmi di posta non mostrano gli SVG): di default
 * l'icona già pubblicata dal sito, sostituibile con `EMAIL_LOGO_URL`.
 */
export function emailLogoUrl(): string {
  return process.env.EMAIL_LOGO_URL ?? `${frontendUrl()}/icon-192.png`;
}
