import { z } from "zod";
import "./zod";
import { MONTHLY_COST_LINES_MAX } from "./monthlyAccounts";

/** Admin → Conti del mese: le voci dei costi fissi al mese (docs/changelog/2026-11-25-conti-del-mese.md). */
export const saveMonthlyCostsSchema = z.object({
  lines: z
    .array(
      z.object({
        label: z.string().trim().min(1, "Scrivi il nome della voce").max(80),
        // Fino a 100.000 € al mese: oltre è quasi certo un errore di battitura.
        monthlyEurCents: z.number().int().min(0).max(10_000_000),
      }),
    )
    .max(MONTHLY_COST_LINES_MAX),
});

export type SaveMonthlyCostsInput = z.infer<typeof saveMonthlyCostsSchema>;

/** Traguardo di utile all'anno scritto dall'admin, da 1.000 € a 10 milioni di €. */
export const saveProfitTargetSchema = z.object({
  yearEurCents: z.number().int().min(100_000).max(1_000_000_000),
});

export type SaveProfitTargetInput = z.infer<typeof saveProfitTargetSchema>;
