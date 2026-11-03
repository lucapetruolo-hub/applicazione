import { z } from "zod";
import "./zod";
import { clientInvoiceRequestSchema } from "./accountingSchemas";
import { MAX_DEPOSIT_PERCENT, MIN_DEPOSIT_PERCENT, jobPaymentChoices } from "./onlinePayments";

/**
 * Controlli dei moduli (zod) di `onlinePayments.ts`, in un file loro: le pagine che
 * usano solo le funzioni di `onlinePayments.ts` non creano questi schemi all'apertura
 * (docs/changelog/2026-11-02-oggi-piu-leggera.md).
 */
export const acceptQuoteSchema = z.object({
  paymentMethod: z.enum(jobPaymentChoices).default("DIRECT"),
  invoiceRequest: clientInvoiceRequestSchema.optional(),
});

/** Modi di pagamento scelti dal professionista nel preventivo (§237). */
export const quotePaymentOfferSchema = {
  paymentOptions: z.array(z.enum(jobPaymentChoices)).min(1, "Scegli almeno un modo di pagamento.").max(jobPaymentChoices.length).optional(),
  depositPercent: z
    .number()
    .int("La percentuale dell'acconto dev'essere un numero intero.")
    .min(MIN_DEPOSIT_PERCENT, `L'acconto va da ${MIN_DEPOSIT_PERCENT} a ${MAX_DEPOSIT_PERCENT}%.`)
    .max(MAX_DEPOSIT_PERCENT, `L'acconto va da ${MIN_DEPOSIT_PERCENT} a ${MAX_DEPOSIT_PERCENT}%.`)
    .optional(),
  /** Salva questi modi come proposta di serie per i prossimi preventivi (§239). */
  rememberPaymentOffer: z.boolean().optional(),
};
export type AcceptQuoteInput = z.infer<typeof acceptQuoteSchema>;

/** Chiusura di un saldo scoperto da parte della Finanza, con la motivazione. */
export const closeUnpaidBalanceSchema = z.object({ note: z.string().trim().min(3, "Scrivi come si è chiuso il saldo.").max(500) });
