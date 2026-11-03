import { z } from "zod";
import "./zod";
import { REQUEST_WITHDRAW_REASONS } from "./requestWithdraw";

/**
 * Controlli dei moduli (zod) di `requestWithdraw.ts`, in un file loro: le pagine che
 * usano solo le funzioni di `requestWithdraw.ts` non creano questi schemi all'apertura
 * (docs/changelog/2026-11-02-oggi-piu-leggera.md).
 */
export const requestWithdrawSchema = z.object({ reason: z.enum(REQUEST_WITHDRAW_REASONS).optional() });
export type RequestWithdrawInput = z.infer<typeof requestWithdrawSchema>;
