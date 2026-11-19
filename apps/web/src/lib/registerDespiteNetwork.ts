"use client";

import { ApiError, isNetworkError } from "@professionisti/api-client";
import { apiClient } from "@/lib/apiClient";

/**
 * Registrazione che regge una rete che salta (docs/changelog/2026-11-19-errore-di-rete-in-italiano.md).
 * Se la chiamata non arriva al sito si riprova da soli dopo 2 secondi. Se il
 * primo invio era invece arrivato e l'account è già stato creato, il secondo
 * viene rifiutato (token anti-bot già usato o "Esiste già un account"): allora
 * si entra con l'email e la password appena scritte, invece di mostrare un
 * errore per un account che c'è.
 */
export async function registerDespiteNetwork(
  send: () => Promise<{ token: string; isNewUser: boolean }>,
  email: string,
  password: string,
): Promise<{ token: string; isNewUser: boolean }> {
  try {
    return await send();
  } catch (err) {
    if (!isNetworkError(err)) throw err;
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
  try {
    return await send();
  } catch (retryErr) {
    if (!(retryErr instanceof ApiError) || isNetworkError(retryErr) || (retryErr.status !== 400 && retryErr.status !== 409)) throw retryErr;
    try {
      const { token } = await apiClient.login(email, password);
      return { token, isNewUser: true };
    } catch {
      throw retryErr;
    }
  }
}
