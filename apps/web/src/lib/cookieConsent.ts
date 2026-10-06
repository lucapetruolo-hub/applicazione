"use client";

import { useEffect, useState } from "react";

/**
 * Consenso ai servizi Google di terze parti (Google Sign-In e, da
 * docs/CHANGELOG.md §133, Google Maps): unico punto che legge/scrive la
 * scelta fatta nel banner cookie, condiviso da `CookieBanner`,
 * `GoogleSignInButton` e `GoogleMapGate`. Salvato in localStorage, niente
 * cookie nostri.
 */
const COOKIE_CONSENT_KEY = "cookie-consent-v1";
/** Evento globale emesso quando l'utente accetta: sveglia chi aspetta il consenso per caricare script Google. */
export const COOKIE_CONSENT_ACCEPTED_EVENT = "cookie-consent-accepted";
/** Evento globale emesso quando l'utente rifiuta o vuole rivedere la scelta (link "Preferenze cookie"). */
export const COOKIE_CONSENT_CHANGED_EVENT = "cookie-consent-changed";

export function hasCookieConsent(): boolean {
  try {
    return window.localStorage.getItem(COOKIE_CONSENT_KEY) === "accepted";
  } catch {
    return false;
  }
}

/** `true` se la scelta è già stata fatta (il banner non va più mostrato). */
export function hasCookieChoice(): boolean {
  try {
    return window.localStorage.getItem(COOKIE_CONSENT_KEY) !== null;
  } catch {
    // localStorage non disponibile (es. privacy mode): meglio non mostrare
    // il banner ad ogni pagina.
    return true;
  }
}

export function grantCookieConsent(): void {
  try {
    window.localStorage.setItem(COOKIE_CONSENT_KEY, "accepted");
  } catch {
    // ignora
  }
  window.dispatchEvent(new Event(COOKIE_CONSENT_ACCEPTED_EVENT));
}

/**
 * Rifiuto dei servizi Google (docs/CHANGELOG.md §170: rifiutare deve essere
 * facile quanto accettare). Se prima erano stati accettati, ricarica la
 * pagina: gli script Google già caricati restano in memoria finché la
 * pagina è aperta, ricaricando spariscono davvero.
 */
export function denyCookieConsent(): void {
  const wasAccepted = hasCookieConsent();
  try {
    window.localStorage.setItem(COOKIE_CONSENT_KEY, "denied");
  } catch {
    // ignora
  }
  window.dispatchEvent(new Event(COOKIE_CONSENT_CHANGED_EVENT));
  if (wasAccepted) window.location.reload();
}

/** Riapre il banner per cambiare la scelta (link "Preferenze cookie" nel footer). */
export function reopenCookieChoice(): void {
  window.dispatchEvent(new Event(COOKIE_CONSENT_CHANGED_EVENT));
}

/** Stato del consenso, aggiornato appena l'utente accetta o rifiuta (dal banner o da un altro punto della pagina). */
export function useCookieConsent(): boolean {
  const [consent, setConsent] = useState(false);
  useEffect(() => {
    const sync = () => setConsent(hasCookieConsent());
    sync();
    window.addEventListener(COOKIE_CONSENT_ACCEPTED_EVENT, sync);
    window.addEventListener(COOKIE_CONSENT_CHANGED_EVENT, sync);
    return () => {
      window.removeEventListener(COOKIE_CONSENT_ACCEPTED_EVENT, sync);
      window.removeEventListener(COOKIE_CONSENT_CHANGED_EVENT, sync);
    };
  }, []);
  return consent;
}
