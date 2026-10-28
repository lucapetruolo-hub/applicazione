import { z } from "zod";
import "./zod";

/**
 * DAC7 lato professionista (docs/CHANGELOG.md §246): dichiarazione a
 * "lavoro terminato", IBAN per chi incassa online, riepilogo annuale.
 */

// ---------------------------------------------------------------------------
// Dichiarazione a "lavoro terminato"
// ---------------------------------------------------------------------------

/**
 * Versione del testo: cambiando il testo si cambia la data, così ogni lavoro
 * resta legato al testo accettato in quel momento (stesso principio di
 * FISCAL_DECLARATION_VERSION). Il tipo fiscale finisce nella versione perché
 * il testo cambia tra privato e partita IVA. Da far validare al
 * commercialista (checklist di lancio).
 */
export const COMPLETION_DECLARATION_DATE = "2026-10-14";

export type CompletionDeclarationKind = "privato" | "piva" | "generico";

const COMPLETION_DECLARATION_START =
  "Dichiaro sotto la mia esclusiva responsabilità che l'importo indicato corrisponde a quanto effettivamente percepito, o da percepire, dal cliente per questo lavoro e mi impegno a rilasciare";

const COMPLETION_DECLARATION_DOCUMENT: Record<CompletionDeclarationKind, string> = {
  privato: "la ricevuta per prestazione occasionale prevista dalla normativa vigente.",
  piva: "la fattura o l'altro documento fiscale previsto dalla normativa vigente.",
  // Dati fiscali non ancora compilati: testo originale, valido per entrambi.
  generico: "il relativo documento fiscale o la ricevuta per prestazione occasionale previsti dalla normativa vigente.",
};

export function completionDeclarationKind(entityType: "PRIVATE_INDIVIDUAL" | "SOLE_PROPRIETOR" | "BUSINESS" | null | undefined): CompletionDeclarationKind {
  if (entityType === "PRIVATE_INDIVIDUAL") return "privato";
  if (entityType === "SOLE_PROPRIETOR" || entityType === "BUSINESS") return "piva";
  return "generico";
}

export function completionDeclaration(entityType: "PRIVATE_INDIVIDUAL" | "SOLE_PROPRIETOR" | "BUSINESS" | null | undefined): {
  version: string;
  text: string;
} {
  const kind = completionDeclarationKind(entityType);
  return {
    version: `${COMPLETION_DECLARATION_DATE}-${kind}`,
    text: `${COMPLETION_DECLARATION_START} ${COMPLETION_DECLARATION_DOCUMENT[kind]}`,
  };
}

// ---------------------------------------------------------------------------
// IBAN
// ---------------------------------------------------------------------------

/** Lunghezza dell'IBAN per i paesi dell'area SEPA (fonte: registro SWIFT). */
const IBAN_LENGTHS: Record<string, number> = {
  AD: 24, AT: 20, BE: 16, BG: 22, CH: 21, CY: 28, CZ: 24, DE: 22, DK: 18, EE: 20, ES: 24, FI: 18, FR: 27, GB: 22, GI: 23,
  GR: 27, HR: 21, HU: 28, IE: 22, IS: 26, IT: 27, LI: 21, LT: 20, LU: 20, LV: 21, MC: 27, MT: 31, NL: 18, NO: 15, PL: 28,
  PT: 25, RO: 24, SE: 24, SI: 19, SK: 24, SM: 27, VA: 22,
};

/** Toglie spazi e trattini e porta in maiuscolo. */
export function normalizeIban(value: string): string {
  return value.replace(/[\s-]+/g, "").toUpperCase();
}

/** IBAN a gruppi di 4 caratteri, come lo stampano le banche. */
export function formatIban(value: string): string {
  return normalizeIban(value).replace(/(.{4})/g, "$1 ").trim();
}

/** IBAN mascherato per mostrarlo: paese + ultime 4 cifre. */
export function maskIban(country: string, last4: string): string {
  return `${country}•• •••• •••• ${last4}`;
}

function mod97(iban: string): number {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const digits = /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder;
}

/**
 * Controllo dell'IBAN (lunghezza del paese + cifre di controllo mod-97):
 * blocca gli errori di battitura, non dice se il conto esiste. Il messaggio
 * dice cosa fare, non solo che è sbagliato.
 */
export function checkIban(value: string): { ok: true; iban: string } | { ok: false; message: string } {
  const iban = normalizeIban(value);
  if (!iban) return { ok: false, message: "Scrivi l'IBAN del conto su cui ricevi i pagamenti." };
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(iban)) {
    return { ok: false, message: "L'IBAN inizia con la sigla del paese e due cifre (es. IT60...) e contiene solo lettere e numeri." };
  }
  const expected = IBAN_LENGTHS[iban.slice(0, 2)];
  if (!expected) return { ok: false, message: "Accettiamo solo conti dei paesi dell'area euro (SEPA)." };
  if (iban.length !== expected) {
    return { ok: false, message: `Un IBAN ${iban.slice(0, 2)} ha ${expected} caratteri, questo ne ha ${iban.length}: controlla di averlo copiato tutto.` };
  }
  if (mod97(iban) !== 1) return { ok: false, message: "L'IBAN non torna: probabilmente c'è un carattere sbagliato. Copialo di nuovo dal sito o dall'app della banca." };
  return { ok: true, iban };
}

export const payoutIbanSchema = z.object({
  iban: z.string().trim().min(1).max(50),
  holderName: z.string().trim().min(2, "Scrivi il nome del titolare del conto.").max(120),
});
export type PayoutIbanInput = z.infer<typeof payoutIbanSchema>;

/**
 * Esito del confronto con il conto indicato a Stripe: Stripe dà solo paese
 * e ultime 4 cifre, quindi "MATCH" vuol dire che quelle tornano.
 */
export type PayoutIbanStripeCheck = "MATCH" | "MISMATCH" | "UNAVAILABLE";

// ---------------------------------------------------------------------------
// Importi DAC7 di un pagamento: diretto e online, con la data in cui contano
// ---------------------------------------------------------------------------

export type Dac7PaymentInput = {
  paymentMethod: "MANOVIA" | "DIRECT";
  status: string;
  netAmountEurCents: number;
  platformFeeEurCents: number;
  balanceDirect: boolean;
  depositEurCents: number | null;
  directReportedAt: Date | null;
  releasedAt: Date | null;
  updatedAt: Date;
  booking: { professionalProfileId: string; finalAmountEurCents: number | null; professionalCompletedAt: Date | null };
};

export type Dac7Entry = {
  professionalProfileId: string;
  /** Giorno in cui l'importo conta per la DAC7 (trimestre). */
  date: Date;
  directEurCents: number;
  onlineEurCents: number;
  feesEurCents: number;
};

/**
 * Da un pagamento di un lavoro alle righe che contano per la DAC7.
 *
 * - Diretto: conta appena il professionista dichiara l'importo a "lavoro
 *   terminato" (il cliente non lo conferma, decisione di Luca del
 *   14/10/2026), nel giorno della dichiarazione.
 * - Online: conta quando i soldi passano al professionista (`releasedAt`),
 *   al netto della commissione. Un rimborso dopo l'accredito riduce
 *   `netAmountEurCents` (quota ripresa al professionista): l'importo resta
 *   nel trimestre dell'accredito, ridotto; un rimborso totale lo toglie
 *   (docs/CHANGELOG.md §247).
 * - Acconto online e saldo diretto: l'acconto conta come online, il resto
 *   dell'importo finale come diretto, nel giorno del lavoro terminato.
 *
 * Mai la data di ultima modifica: una modifica successiva (conferma del
 * cliente, rimborso) sposterebbe l'importo in un altro trimestre.
 */
export function dac7Entries(jp: Dac7PaymentInput, includeDirectPayments: boolean): Dac7Entry[] {
  const professionalProfileId = jp.booking.professionalProfileId;
  const completedAt = jp.directReportedAt ?? jp.booking.professionalCompletedAt ?? jp.updatedAt;

  if (jp.paymentMethod === "DIRECT") {
    if (!includeDirectPayments) return [];
    if (jp.status !== "CONFIRMED" && jp.status !== "AWAITING_CONFIRMATION") return [];
    return [{ professionalProfileId, date: completedAt, directEurCents: jp.netAmountEurCents, onlineEurCents: 0, feesEurCents: 0 }];
  }

  // Online rimborsato del tutto: niente da comunicare per la parte online
  // (resta l'eventuale saldo pagato direttamente).
  const fullyRefunded = jp.status === "REFUNDED";
  if (jp.status !== "CONFIRMED" && !fullyRefunded) return [];
  const entries: Dac7Entry[] = [];
  if (!fullyRefunded && (jp.netAmountEurCents > 0 || jp.platformFeeEurCents > 0)) {
    entries.push({ professionalProfileId, date: jp.releasedAt ?? jp.updatedAt, directEurCents: 0, onlineEurCents: Math.max(0, jp.netAmountEurCents), feesEurCents: jp.platformFeeEurCents });
  }
  if (includeDirectPayments && jp.balanceDirect && jp.booking.finalAmountEurCents !== null) {
    const directPart = jp.booking.finalAmountEurCents - Math.min(jp.booking.finalAmountEurCents, jp.depositEurCents ?? 0);
    if (directPart > 0) {
      entries.push({ professionalProfileId, date: jp.booking.professionalCompletedAt ?? completedAt, directEurCents: directPart, onlineEurCents: 0, feesEurCents: 0 });
    }
  }
  return entries;
}

/** Trimestre solare (1-4) di una data, in UTC come il resto della DAC7. */
export function dac7Quarter(date: Date): 1 | 2 | 3 | 4 {
  return (Math.floor(date.getUTCMonth() / 3) + 1) as 1 | 2 | 3 | 4;
}

/** Riepilogo DAC7 di un anno mostrato al professionista (`/dashboard/fiscale/dac7`). */
export type Dac7QuarterSummary = {
  quarter: 1 | 2 | 3 | 4;
  directEurCents: number;
  onlineEurCents: number;
  feesEurCents: number;
  jobs: number;
};

export type Dac7YearSummary = {
  year: number;
  quarters: Dac7QuarterSummary[];
  totalEurCents: number;
  /** Data in cui i dati sono stati comunicati all'Agenzia delle Entrate, null se non ancora. */
  submittedAt: string | null;
  /** Avviso annuale inviato al professionista. */
  notifiedAt: string | null;
};

/** Ultimo giorno utile per la comunicazione annuale (e per l'avviso al professionista): 31 gennaio dell'anno dopo. */
export function dac7AnnualDeadline(year: number): string {
  return `${year + 1}-01-31`;
}

export const DAC7_QUARTER_LABEL: Record<1 | 2 | 3 | 4, string> = { 1: "Gen – Mar", 2: "Apr – Giu", 3: "Lug – Set", 4: "Ott – Dic" };

function dac7DateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" });
}

/** A che punto è l'anno: comunicato, in corso o in preparazione (pagina e PDF del riepilogo). */
export function dac7YearStatus(summary: Pick<Dac7YearSummary, "year" | "submittedAt">, now: Date = new Date()): { variant: "verificato" | "nuovo"; label: string; detail: string } {
  if (summary.submittedAt) return { variant: "verificato", label: "Comunicato al fisco", detail: `Inviato il ${dac7DateLabel(summary.submittedAt)}.` };
  if (summary.year >= now.getFullYear()) return { variant: "nuovo", label: "Anno in corso", detail: "Si aggiorna ogni notte." };
  return { variant: "nuovo", label: "In preparazione", detail: `Da comunicare entro il ${dac7DateLabel(dac7AnnualDeadline(summary.year))}.` };
}
