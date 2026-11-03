import { z } from "zod";
import "./zod";
import { ONLINE_LIMIT_REASON_MAX } from "./onlineLimit";

/**
 * Controlli dei moduli (zod) di `onlineLimit.ts`, in un file loro: le pagine che
 * usano solo le funzioni di `onlineLimit.ts` non creano questi schemi all'apertura
 * (docs/changelog/2026-11-02-oggi-piu-leggera.md).
 */
/** Admin → Pagamenti: togliere il tetto chiede un motivo, che resta nel registro azioni. */
export const setOnlineLimitSchema = z
  .object({ removed: z.boolean(), reason: z.string().trim().max(ONLINE_LIMIT_REASON_MAX).optional() })
  .refine((v) => !v.removed || (v.reason?.length ?? 0) >= 3, { message: "Scrivi perché togli il tetto.", path: ["reason"] });
export type SetOnlineLimitInput = z.infer<typeof setOnlineLimitSchema>;
