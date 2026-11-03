import { z } from "zod";
import "./zod";
import { BANK_DISPUTE_PRO_PHOTOS_MAX } from "./bankDisputes";

/**
 * Controlli dei moduli (zod) di `bankDisputes.ts`, in un file loro: le pagine che
 * usano solo le funzioni di `bankDisputes.ts` non creano questi schemi all'apertura
 * (docs/changelog/2026-11-02-oggi-piu-leggera.md).
 */
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

/**
 * Spiegazione e foto del professionista sulla contestazione, dalla sua area:
 * l'admin le rilegge e le manda alla banca con le prove.
 */
export const bankDisputeProNoteSchema = z.object({
  note: z.string().trim().min(20, "Racconta in qualche riga come è andato il lavoro.").max(5000),
  photoUrls: z.array(z.string().url()).max(BANK_DISPUTE_PRO_PHOTOS_MAX).default([]),
});
export type BankDisputeProNoteInput = z.infer<typeof bankDisputeProNoteSchema>;
