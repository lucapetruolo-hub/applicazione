import { z } from "zod";
import "./zod";

/**
 * Controlli dei moduli (zod) di `dac7.ts`, in un file loro: le pagine che
 * usano solo le funzioni di `dac7.ts` non creano questi schemi all'apertura
 * (docs/changelog/2026-11-02-oggi-piu-leggera.md).
 */
export const payoutIbanSchema = z.object({
  iban: z.string().trim().min(1).max(50),
  holderName: z.string().trim().min(2, "Scrivi il nome del titolare del conto.").max(120),
});
export type PayoutIbanInput = z.infer<typeof payoutIbanSchema>;
