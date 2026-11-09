import { personalLinkStorageKey } from "@professionisti/shared";

/**
 * Il cliente è arrivato al profilo dal link personale del professionista
 * (docs/changelog/2026-11-08-canale-del-professionista.md): lo si ricorda
 * nella scheda del browser (sessionStorage, solo tecnico: sparisce chiudendo
 * la scheda, nessun consenso), così resta vero anche se prima di mandare la
 * richiesta il cliente accede o si registra.
 */
export function rememberPersonalLink(professionalProfileId: string): void {
  try {
    window.sessionStorage.setItem(personalLinkStorageKey(professionalProfileId), "1");
  } catch {
    // Navigazione privata o memoria bloccata: la richiesta parte come le altre.
  }
}

export function cameFromPersonalLink(professionalProfileId: string): boolean {
  try {
    return window.sessionStorage.getItem(personalLinkStorageKey(professionalProfileId)) === "1";
  } catch {
    return false;
  }
}
