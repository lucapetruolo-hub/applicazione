import { z } from "zod";
import "./zod";

/**
 * Contestazioni in banca (chargeback) sui pagamenti online dei lavori:
 * Admin → Pagamenti manda alla banca del cliente le prove del lavoro senza
 * passare dalla Dashboard Stripe (richiesta di Luca del 28/10/2026,
 * docs/changelog/2026-10-28-stripe-prova.md). Il sito prepara i campi e un
 * PDF con preventivo, pagamenti, chiusura del lavoro e messaggi.
 */

/** Stati di Stripe in cui la contestazione aspetta ancora le prove. */
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

/** Campi delle prove che l'admin rilegge prima di mandarle. */
export const bankDisputeEvidenceSchema = z.object({
  productDescription: z.string().trim().min(3).max(1500),
  customerName: z.string().trim().max(200).optional(),
  customerEmail: z.string().trim().max(200).optional(),
  serviceDate: z.string().trim().max(60).optional(),
  explanation: z.string().trim().min(20, "Spiega in qualche riga perché il pagamento è dovuto.").max(10_000),
  /** true = manda alla banca (non si può più cambiare), false = salva soltanto su Stripe. */
  submit: z.boolean(),
});
export type BankDisputeEvidenceInput = z.infer<typeof bankDisputeEvidenceSchema>;

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
  /** Campi già compilati dal sito, da rileggere. */
  draft: Omit<BankDisputeEvidenceInput, "submit">;
};
