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

/** Stato del consenso, aggiornato appena l'utente accetta (dal banner o da un altro punto della pagina). */
export function useCookieConsent(): boolean {
  const [consent, setConsent] = useState(false);
  useEffect(() => {
    setConsent(hasCookieConsent());
    const onAccepted = () => setConsent(true);
    window.addEventListener(COOKIE_CONSENT_ACCEPTED_EVENT, onAccepted);
    return () => window.removeEventListener(COOKIE_CONSENT_ACCEPTED_EVENT, onAccepted);
  }, []);
  return consent;
}
