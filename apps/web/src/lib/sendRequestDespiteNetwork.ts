import { ApiError, isNetworkError } from "@professionisti/api-client";
import { DUPLICATE_REQUEST_CODE } from "@professionisti/shared";
import { apiClient } from "@/lib/apiClient";

/** Quello che serve alla schermata "Richiesta inviata". */
export type SentRequest = { matchedProfessionals: number; requestsCount: number };

/**
 * Invio della richiesta di preventivo che regge una rete che salta, senza mai
 * mandarla due volte (docs/changelog/2026-11-19-errore-di-rete-in-italiano.md).
 * Se la chiamata non arriva al sito si riprova da soli dopo 2 secondi. Se il
 * primo invio era invece arrivato, il server rifiuta il secondo come doppione
 * (`DUPLICATE_REQUEST_CODE`, stessa descrizione negli ultimi 30 minuti): vuol
 * dire che la richiesta c'è, e si mostra "Richiesta inviata" con i dati presi
 * da "Le mie richieste". Un doppione senza rete caduta prima resta un errore.
 */
export async function sendRequestDespiteNetwork(
  /** `isRetry`: la riprova da sola dopo una rete caduta (mai con "Invia comunque"). */
  send: (isRetry: boolean) => Promise<{ matchedProfessionals: number; requests?: unknown[] }>,
  token: string,
  description: string,
): Promise<SentRequest> {
  try {
    const response = await send(false);
    return { matchedProfessionals: response.matchedProfessionals, requestsCount: response.requests?.length ?? 1 };
  } catch (err) {
    if (!isNetworkError(err)) throw err;
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
  try {
    const response = await send(true);
    return { matchedProfessionals: response.matchedProfessionals, requestsCount: response.requests?.length ?? 1 };
  } catch (retryErr) {
    if (!(retryErr instanceof ApiError) || retryErr.code !== DUPLICATE_REQUEST_CODE) throw retryErr;
    return sentAlready(token, description);
  }
}

/** La richiesta arrivata al primo invio, letta da "Le mie richieste". */
async function sentAlready(token: string, description: string): Promise<SentRequest> {
  try {
    const since = Date.now() - 30 * 60 * 1000;
    const text = description.trim();
    const mine = (await apiClient.myGuidedRequests(token)).filter((r) => r.description.trim() === text && new Date(r.createdAt).getTime() >= since);
    if (mine.length > 0) {
      return { matchedProfessionals: mine.reduce((sum, r) => sum + r.sentTo.length, 0), requestsCount: mine.length };
    }
  } catch {
    // La richiesta c'è comunque (lo ha detto il server): si mostra senza i numeri.
  }
  return { matchedProfessionals: 1, requestsCount: 1 };
}
