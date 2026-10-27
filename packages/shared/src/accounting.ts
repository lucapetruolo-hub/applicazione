import { z } from "zod";
import "./zod";
import { isValidCodiceFiscale, isValidPartitaIva } from "./fiscalValidation";
import type { ProfessionalCategorySlug } from "./categories";

/**
 * Documenti contabili e fiscali (decisioni dell'utente del 26-27/10/2026,
 * docs/CHANGELOG.md §372). Il professionista documenta il lavoro al cliente
 * (fattura, documento commerciale o ricevuta per prestazione occasionale):
 * noi gli prepariamo solo una copia di cortesia, mai inviata all'Agenzia.
 * Noi fatturiamo a lui le trattenute sui pagamenti online (una fattura al
 * mese), l'abbonamento e le quote di passaggio, con l'IVA.
 */

/** IVA delle nostre fatture e delle trattenute (22%). */
export const PLATFORM_VAT_RATE_BASIS_POINTS = 2200;

/** IVA su un imponibile, arrotondata al centesimo. */
export function vatOnEurCents(taxableEurCents: number, rateBasisPoints: number = PLATFORM_VAT_RATE_BASIS_POINTS): number {
  return Math.round((taxableEurCents * rateBasisPoints) / 10_000);
}

/**
 * Da un totale con l'IVA dentro: imponibile, IVA e arrotondamento (il
 * centesimo che non torna tra totale e imponibile + IVA, scritto nel campo
 * "Arrotondamento" della fattura elettronica, domanda 60 al commercialista).
 */
export function splitVatEurCents(
  grossEurCents: number,
  rateBasisPoints: number = PLATFORM_VAT_RATE_BASIS_POINTS,
): { taxableEurCents: number; vatEurCents: number; roundingEurCents: number } {
  const taxableEurCents = Math.round((grossEurCents * 10_000) / (10_000 + rateBasisPoints));
  const vatEurCents = vatOnEurCents(taxableEurCents, rateBasisPoints);
  return { taxableEurCents, vatEurCents, roundingEurCents: grossEurCents - taxableEurCents - vatEurCents };
}

/**
 * Il professionista applica l'IVA nelle sue fatture? L'azienda sempre, il
 * privato mai, chi ha la partita IVA come persona lo dice lui nei dati
 * fiscali (no = regime forfettario). `null` finché non ha risposto.
 */
export function professionalChargesVat(entityType: string | null | undefined, chargesVat: boolean | null | undefined): boolean | null {
  if (entityType === "BUSINESS") return true;
  if (entityType === "PRIVATE_INDIVIDUAL") return false;
  if (entityType === "SOLE_PROPRIETOR") return chargesVat ?? null;
  return null;
}

/**
 * Accanto al totale del preventivo (Codice del consumo, art. 49: al
 * consumatore va detto il prezzo finale, tasse comprese). "IVA inclusa"
 * solo per chi la applica: per forfettari e privati sarebbe falso.
 */
export function quotePriceTaxNote(chargesVat: boolean | null): string {
  return chargesVat ? "IVA inclusa" : "Prezzo finale";
}

/** Aiuto nel modulo del preventivo: il prezzo che il professionista scrive è quello finale. */
export function quotePriceHelp(chargesVat: boolean | null): string {
  if (chargesVat === null) return "Scrivi i prezzi finali per il cliente, IVA compresa se la applichi.";
  return chargesVat ? "Scrivi i prezzi finali per il cliente, IVA compresa." : "Scrivi i prezzi finali per il cliente: è quello che paga.";
}

/** Codice destinatario "nessuno": la fattura va nell'area dell'Agenzia delle Entrate del destinatario. */
export const SDI_NO_RECIPIENT_CODE = "0000000";

const PEC_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Codice destinatario (7 caratteri) o PEC, scritti nello stesso campo: con
 * la chiocciola è una PEC. Vuoto o "0000000" = nessuno (facoltativo).
 */
export function parseInvoiceRecipient(
  value: string | null | undefined,
): { ok: true; sdiRecipientCode: string | null; pecEmail: string | null } | { ok: false; error: string } {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return { ok: true, sdiRecipientCode: null, pecEmail: null };
  if (trimmed.includes("@")) {
    return PEC_PATTERN.test(trimmed)
      ? { ok: true, sdiRecipientCode: null, pecEmail: trimmed.toLowerCase() }
      : { ok: false, error: "La PEC non sembra valida." };
  }
  const code = trimmed.toUpperCase().replace(/\s/g, "");
  if (!/^[A-Z0-9]{7}$/.test(code)) return { ok: false, error: "Il codice destinatario ha 7 caratteri, lettere e numeri." };
  return { ok: true, sdiRecipientCode: code === SDI_NO_RECIPIENT_CODE ? null : code, pecEmail: null };
}

/** Il campo unico mostrato nel modulo, dai due valori salvati. */
export function invoiceRecipientText(sdiRecipientCode: string | null | undefined, pecEmail: string | null | undefined): string {
  return sdiRecipientCode ?? pecEmail ?? "";
}

// --- Fattura chiesta dal cliente -------------------------------------------
// Decisione dell'utente del 27/10/2026: "Mi serve la fattura" nell'accettazione
// del preventivo, a nome suo (codice fiscale) o intestata a una partita IVA
// (aziende, ditte, liberi professionisti). Il professionista lo legge
// nell'avviso "Preventivo accettato" e sulla scheda del lavoro: è un dato del
// cliente, visibile solo dopo l'accettazione come gli altri contatti
// (CLAUDE.md §5 punto 9).

export const clientInvoiceKinds = ["PERSON", "VAT"] as const;
export type ClientInvoiceKind = (typeof clientInvoiceKinds)[number];

export const CLIENT_INVOICE_KIND_LABEL: Record<ClientInvoiceKind, string> = {
  PERSON: "A mio nome",
  VAT: "A una partita IVA",
};

export const clientInvoiceRequestSchema = z
  .object({
    kind: z.enum(clientInvoiceKinds),
    /** Nome e cognome, o intestazione (ragione sociale, nome della ditta o dello studio). */
    name: z.string().trim().min(2, "Scrivi il nome a cui intestare la fattura.").max(200),
    taxCode: z.string().trim().max(16).optional(),
    vatNumber: z.string().trim().max(20).optional(),
    /** Codice destinatario o PEC, facoltativo. */
    recipient: z.string().trim().max(254).optional(),
    street: z.string().trim().min(2, "Scrivi la via.").max(200),
    houseNumber: z.string().trim().max(20).optional(),
    postalCode: z.string().trim().regex(/^\d{5}$/, "Il CAP ha 5 cifre."),
    city: z.string().trim().min(2, "Scrivi il comune.").max(120),
    province: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "La provincia è la sigla di 2 lettere, es. RM.").optional(),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "PERSON" && !isValidCodiceFiscale(value.taxCode ?? "")) {
      ctx.addIssue({ code: "custom", path: ["taxCode"], message: "Il codice fiscale non sembra valido." });
    }
    if (value.kind === "VAT" && !isValidPartitaIva(value.vatNumber ?? "")) {
      ctx.addIssue({ code: "custom", path: ["vatNumber"], message: "La partita IVA non sembra valida (11 cifre)." });
    }
    if (value.kind === "VAT" && value.taxCode && !isValidCodiceFiscale(value.taxCode) && !isValidPartitaIva(value.taxCode)) {
      ctx.addIssue({ code: "custom", path: ["taxCode"], message: "Il codice fiscale non sembra valido." });
    }
    const recipient = parseInvoiceRecipient(value.recipient);
    if (!recipient.ok) ctx.addIssue({ code: "custom", path: ["recipient"], message: recipient.error });
  });
export type ClientInvoiceRequestInput = z.infer<typeof clientInvoiceRequestSchema>;

/** Dati per la fattura chiesti dal cliente, come li vedono lui e il professionista. */
export type ClientInvoiceRequestView = {
  kind: ClientInvoiceKind;
  name: string;
  taxCode: string | null;
  vatNumber: string | null;
  sdiRecipientCode: string | null;
  pecEmail: string | null;
  street: string;
  houseNumber: string | null;
  postalCode: string;
  city: string;
  province: string | null;
  requestedAt: string;
};

/** Righe da copiare nel programma delle fatture, nell'ordine in cui le chiede. */
export function clientInvoiceLines(view: ClientInvoiceRequestView): string[] {
  return [
    view.name,
    view.kind === "VAT" ? `P.IVA ${view.vatNumber ?? ""}` : null,
    view.taxCode ? `Codice fiscale ${view.taxCode}` : null,
    [[view.street, view.houseNumber].filter(Boolean).join(" "), [view.postalCode, view.city, view.province ? `(${view.province})` : null].filter(Boolean).join(" ")].join(", "),
    view.sdiRecipientCode ? `Codice destinatario ${view.sdiRecipientCode}` : view.pecEmail ? `PEC ${view.pecEmail}` : null,
  ].filter((line): line is string => !!line);
}

// --- Detrazioni per i lavori in casa (domanda 28) ----------------------------
// Bonus per ristrutturazioni e risparmio energetico: di solito vanno pagati
// con bonifico "parlante", non con la carta. Avviso nella scelta del
// pagamento per i mestieri della casa, finché il commercialista non risponde.

export const HOME_RENOVATION_CATEGORIES: readonly ProfessionalCategorySlug[] = [
  "idraulico",
  "elettricista",
  "imbianchino",
  "fabbro",
  "climatizzazione",
  "muratore",
  "falegname",
];

export function categoryMayHaveTaxBonus(slug: string | null | undefined): boolean {
  return !!slug && (HOME_RENOVATION_CATEGORIES as readonly string[]).includes(slug);
}

export const TAX_BONUS_PAYMENT_NOTE = {
  short: "Vuoi la detrazione per i lavori in casa? Di solito serve il bonifico parlante, non la carta.",
  more: "Per i bonus su ristrutturazioni e risparmio energetico la legge chiede di pagare con un bonifico \"parlante\" (con la causale del bonus). Se ti interessa, scegli il pagamento diretto e chiedi al professionista i dati per il bonifico.",
};
