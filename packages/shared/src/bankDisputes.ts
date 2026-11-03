
/**
 * Contestazioni in banca (chargeback) sui pagamenti online dei lavori:
 * Admin → Pagamenti manda alla banca del cliente le prove del lavoro senza
 * passare dalla Dashboard Stripe (richiesta di Luca del 28/10/2026,
 * docs/changelog/2026-10-28-stripe-prova.md). Il sito prepara i campi e un
 * PDF con preventivo, pagamenti, chiusura del lavoro e messaggi.
 */

/** Stati di Stripe in cui la contestazione aspetta ancora le prove. */
import type { BankDisputeEvidenceInput } from "./bankDisputesSchemas";
export const BANK_DISPUTE_OPEN_STATUSES = ["needs_response", "warning_needs_response"] as const;
/** Stati in cui la banca sta decidendo. */
export const BANK_DISPUTE_REVIEW_STATUSES = ["under_review", "warning_under_review"] as const;

/** Motivo della contestazione detto in parole semplici, dal codice di Stripe. */
export function bankDisputeReasonLabel(reason: string | null | undefined): string {
  switch (reason) {
    case "fraudulent":
      return "Il cliente dice di non aver fatto lui il pagamento";
    case "product_not_received":
      return "Il cliente dice che il lavoro non è stato fatto";
    case "product_unacceptable":
      return "Il cliente dice che il lavoro non andava bene";
    case "duplicate":
      return "Il cliente dice di aver pagato due volte";
    case "credit_not_processed":
      return "Il cliente dice di non aver ricevuto un rimborso";
    case "unrecognized":
      return "Il cliente non riconosce il pagamento";
    case "subscription_canceled":
      return "Il cliente dice di aver annullato";
    default:
      return "Motivo generico della banca";
  }
}

export function bankDisputeStatusLabel(status: string | null | undefined): string {
  if (status && (BANK_DISPUTE_OPEN_STATUSES as readonly string[]).includes(status)) return "Da rispondere";
  if (status && (BANK_DISPUTE_REVIEW_STATUSES as readonly string[]).includes(status)) return "Prove inviate, decide la banca";
  if (status === "won") return "Vinta";
  if (status === "lost") return "Persa";
  return "Chiusa";
}

/** Giorni prima della scadenza delle prove in cui il team riceve l'avviso. */
export const BANK_DISPUTE_REMINDER_DAYS = 3;
/** Giorni prima della scadenza in cui il professionista che non ha scritto riceve il promemoria. */
export const BANK_DISPUTE_PRO_REMINDER_DAYS = 5;
export const BANK_DISPUTE_PRO_PHOTOS_MAX = 10;

/** Contestazione vista dal professionista nel riepilogo del pagamento. */
export type ProfessionalBankDispute = {
  /** Aspetta ancora le prove: il professionista può scrivere o cambiare la sua spiegazione. */
  open: boolean;
  status: string;
  dueBy: string | null;
  note: string | null;
  photoUrls: string[];
  noteAt: string | null;
};

/**
 * Una delle contestazioni dello stesso lavoro: acconto e saldo sono due
 * addebiti e la banca può contestarli tutti e due (collaudo F-21).
 */
export type BankDisputePart = {
  disputeId: string;
  /** Quale pagamento: null se non si sa (archivio, senza chiedere a Stripe). */
  payment: "DEPOSIT" | "BALANCE" | null;
  status: string;
  /** null nell'archivio, dove non si chiede a Stripe. */
  amountEurCents: number | null;
  dueBy: string | null;
};

export type AdminBankDispute = {
  jobPaymentId: string;
  bookingId: string;
  disputeId: string;
  businessName: string;
  clientName: string;
  amountEurCents: number;
  reason: string | null;
  status: string;
  /** Ultimo giorno per mandare le prove, null se Stripe non lo dice. */
  dueBy: string | null;
  /** Prove già mandate alla banca: non si possono più cambiare. */
  submitted: boolean;
  /** Spiegazione mandata alla banca, null se non è ancora stata mandata. */
  sentExplanation: string | null;
  /** Spiegazione e foto mandate dal professionista, null se non ha scritto nulla. */
  professionalNote: { text: string; photoUrls: string[]; at: string } | null;
  /** Campi già compilati dal sito, da rileggere. */
  draft: Omit<BankDisputeEvidenceInput, "submit">;
  /** Tutte le contestazioni del lavoro, una riga ciascuna (più di una se acconto e saldo sono contestati). */
  parts: BankDisputePart[];
};

/** Prove scritte dall'admin e salvate dal sito, così come sono partite. */
export type BankDisputeEvidenceRecord = Omit<BankDisputeEvidenceInput, "submit"> & {
  /** Testo arrivato davvero a Stripe quando è diverso (solo con le chiavi di prova). */
  stripeText?: string;
};

/**
 * Archivio delle contestazioni in banca, aperte e chiuse, in Admin →
 * Pagamenti (richiesta di Luca del 28/10/2026, "poter risalire a tutto e
 * fare una ricerca", docs/changelog/2026-10-28-stripe-prova.md).
 */
export type AdminBankDisputeArchiveRow = {
  jobPaymentId: string;
  bookingId: string;
  disputeId: string;
  businessName: string;
  clientName: string;
  clientEmail: string | null;
  amountEurCents: number;
  reason: string | null;
  status: string;
  openedAt: string | null;
  dueBy: string | null;
  closedAt: string | null;
  /** Quanto è tornato al cliente con la contestazione persa o con i rimborsi. */
  refundedEurCents: number;
  professionalNote: { text: string; photoUrls: string[]; at: string } | null;
  evidence: BankDisputeEvidenceRecord | null;
  evidenceSentAt: string | null;
  /** Chi ha mandato le prove: email dell'admin. */
  evidenceSentBy: string | null;
  /** C'è il PDF caricato su Stripe con le prove. */
  hasSentPdf: boolean;
  /** Ogni passaggio, dal più vecchio: by è l'email di chi l'ha fatto, null = Stripe o il sito da solo. */
  history: { at: string; text: string; by: string | null }[];
  /** Tutte le contestazioni del lavoro, con il loro stato. */
  parts: BankDisputePart[];
};
