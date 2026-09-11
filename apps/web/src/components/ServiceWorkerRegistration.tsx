"use client";

import { useEffect } from "react";

/**
 * Registra `public/sw.js` (installabilità PWA) al primo caricamento —
 * componente senza resa visiva, montato una sola volta nel layout radice.
 * Nessun errore mostrato all'utente se non supportato (browser vecchi,
 * contesto non sicuro in sviluppo locale via http): la registrazione è
 * un miglioramento progressivo, mai un requisito per usare il sito.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
