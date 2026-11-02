/**
 * Recensioni in controllo prima della pubblicazione (collaudo P-01,
 * docs/changelog/2026-11-02-collaudo-recensioni-abusi.md): una recensione
 * finta si pubblicava in 10 minuti con un secondo account. Con uno di questi
 * segnali la recensione aspetta un admin, che la pubblica o la nasconde.
 */
export type ReviewHoldReason =
  | "SAME_PHONE"
  | "SAME_ADDRESS"
  | "SAME_EMAIL"
  | "BOOKED_AFTER_APPOINTMENT"
  | "NEW_CLIENT_DIRECT";

export const REVIEW_HOLD_REASON_LABEL: Record<ReviewHoldReason, string> = {
  SAME_PHONE: "Cliente e professionista hanno lo stesso telefono",
  SAME_ADDRESS: "Cliente e professionista hanno lo stesso indirizzo",
  SAME_EMAIL: "Le email di cliente e professionista sono la stessa casella",
  BOOKED_AFTER_APPOINTMENT:
    "Il lavoro è stato fissato quando l'orario era già passato",
  NEW_CLIENT_DIRECT: "Cliente iscritto da meno di 2 giorni, pagamento diretto",
};

/** Ore dall'iscrizione del cliente entro cui una recensione con pagamento diretto va controllata. */
export const REVIEW_HOLD_NEW_CLIENT_HOURS = 48;

/** Tempo che un admin ha per decidere una recensione in controllo (scadenza nella coda "Da fare"). */
export const REVIEW_HOLD_DECISION_HOURS = 48;

/**
 * La stessa casella di posta: maiuscole, "+qualcosa" e, per Gmail, i punti
 * non contano ("mario.rossi+prova@gmail.com" = "mariorossi@gmail.com").
 */
export function emailMailbox(email: string | null | undefined): string | null {
  const value = (email ?? "").trim().toLowerCase();
  const at = value.lastIndexOf("@");
  if (at <= 0) return null;
  let local = value.slice(0, at).split("+")[0] ?? "";
  let domain = value.slice(at + 1);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return local ? `${local}@${domain}` : null;
}
