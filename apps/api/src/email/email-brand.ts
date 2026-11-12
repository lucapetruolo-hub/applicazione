import { BRAND } from "@professionisti/shared";

/**
 * Nome, logo e colori di tutte le email (docs/CHANGELOG.md §185). Nome ed
 * email di assistenza arrivano da `BRAND` (`packages/shared/src/brand.ts`,
 * unico punto da toccare per cambiare marchio; per il mittente anche
 * `RESEND_FROM_EMAIL` su Render).
 * I colori sono gli stessi della palette A del sito (`packages/ui/src/tokens.ts`),
 * scritti qui a mano perché l'API non dipende dal pacchetto UI.
 */
export const EMAIL_BRAND = {
  name: BRAND.name,
  /** Firma in fondo a ogni email. */
  signature: `Il team di ${BRAND.name}`,
  supportEmail: BRAND.supportEmail,
  colors: {
    background: "#FAF2E8",
    card: "#FFFFFF",
    text: "#1B1A18",
    // Titoli in verde inchiostro come sul sito (brand.inchiostro, 11,3:1 sul crema).
    heading: "#0F3B2C",
    muted: "#5E5A54",
    border: "#E7E0D7",
    // Verde pieno dei pulsanti del sito (cianografiaPieno, §350/§355): bianco leggibile, contrasto 4,7.
    primary: "#1e6b6e",
    primaryDark: "#186163",
    primaryTint: "#DFF0F0",
    urgent: "#B42318",
    urgentTint: "#FDE8E6",
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
