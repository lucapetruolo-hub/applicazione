// Senza "use client": la legge anche app/layout.tsx, sul server.

/** Chiave della scelta del banner cookie in localStorage (lib/cookieConsent.ts). */
export const COOKIE_CONSENT_KEY = "cookie-consent-v1";

/**
 * Attributo su <html> scritto prima che la pagina compaia (script in
 * app/layout.tsx) quando la scelta è già fatta: il banner arriva già scritto
 * dal server e così si nasconde subito, senza lampeggiare. Prima lo
 * disegnava solo il browser, per ultimo, e da telefono era l'elemento che
 * Google misurava come "pagina pronta" (collaudo N-09,
 * docs/changelog/2026-10-30-velocita-telefono.md).
 */
export const COOKIE_CHOICE_ATTRIBUTE = "data-cookie-choice";
export const COOKIE_CHOICE_BOOT_SCRIPT = `(function(){var c=true;try{c=localStorage.getItem("${COOKIE_CONSENT_KEY}")!==null}catch(e){}if(c)document.documentElement.setAttribute("${COOKIE_CHOICE_ATTRIBUTE}","1")})()`;
