import { createApiClient } from "@professionisti/api-client";
import { countSubmitFailure } from "./siteCounts";
import { storedTrafficSource } from "./storedTrafficSource";
import { storedInviteCode } from "./storedInviteCode";
import { API_URL } from "./apiUrl";

const DEVICE_ID_KEY = "login-device-id";

/**
 * Codice casuale di questo browser, per riconoscere un accesso da un
 * dispositivo nuovo (docs/CHANGELOG.md §289). Serve solo alla sicurezza
 * dell'account, non a profilare: nessun consenso cookie. Senza memoria del
 * browser (navigazione privata bloccata) non si manda nulla.
 */
function deviceId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    let id = window.localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = window.crypto.randomUUID();
      window.localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

export const apiClient = createApiClient({
  baseUrl: API_URL,
  deviceId,
  // Andamento del sito (docs/CHANGELOG.md §372): provenienza delle iscrizioni e invii non riusciti.
  trafficSource: storedTrafficSource,
  inviteCode: storedInviteCode,
  onFailure: (failure) => {
    if (typeof window !== "undefined") countSubmitFailure(failure);
  },
});
