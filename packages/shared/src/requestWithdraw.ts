import { z } from "zod";
import "./zod";

/**
 * "Elimina richiesta" del cliente (docs/CHANGELOG.md §343): motivo
 * facoltativo, scelto con un tocco, e quanto resta nel database.
 */
export const REQUEST_WITHDRAW_REASONS = ["FOUND_ELSEWHERE", "NO_LONGER_NEEDED", "MISTAKE"] as const;
export type RequestWithdrawReason = (typeof REQUEST_WITHDRAW_REASONS)[number];

/** Come lo sceglie il cliente. */
export const REQUEST_WITHDRAW_REASON_CLIENT_LABEL: Record<RequestWithdrawReason, string> = {
  FOUND_ELSEWHERE: "Ho già trovato qualcuno",
  NO_LONGER_NEEDED: "Non mi serve più",
  MISTAKE: "L'ho mandata per sbaglio",
};

/** Come lo legge il professionista, dopo "Ritirata dal cliente". */
export const REQUEST_WITHDRAW_REASON_PROFESSIONAL_LABEL: Record<RequestWithdrawReason, string> = {
  FOUND_ELSEWHERE: "ha già trovato qualcuno",
  NO_LONGER_NEEDED: "non gli serve più",
  MISTAKE: "l'aveva mandata per sbaglio",
};

/** Dopo quanti giorni una richiesta eliminata dal cliente si cancella davvero (da confermare con l'avvocato, domanda 38). */
export const CLIENT_DELETED_REQUEST_RETENTION_DAYS = 90;

/** Entro quanto tempo "Annulla" rimette la richiesta com'era. Il sito mostra il pulsante per pochi secondi; il margine copre una rete lenta. */
export const REQUEST_RESTORE_WINDOW_MINUTES = 10;

export const requestWithdrawSchema = z.object({ reason: z.enum(REQUEST_WITHDRAW_REASONS).optional() });
export type RequestWithdrawInput = z.infer<typeof requestWithdrawSchema>;
