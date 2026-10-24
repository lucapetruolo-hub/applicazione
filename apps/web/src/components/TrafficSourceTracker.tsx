"use client";

import { useEffect } from "react";
import { trafficSourceFromReferrer } from "@professionisti/shared";

/** Chiave di sessionStorage con la provenienza della visita (docs/CHANGELOG.md §291). */
export const TRAFFIC_SOURCE_STORAGE_KEY = "traffic_source";

/**
 * Ricorda da dove è arrivata la visita (Google, social, diretto...) alla
 * prima pagina aperta, per allegarla alla richiesta di preventivo: è il modo
 * di contare le richieste portate da Google. Solo la categoria, nella scheda
 * del browser e fino alla sua chiusura; nessun cookie, nessun dato personale.
 */
export function TrafficSourceTracker() {
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(TRAFFIC_SOURCE_STORAGE_KEY)) return;
      window.sessionStorage.setItem(
        TRAFFIC_SOURCE_STORAGE_KEY,
        trafficSourceFromReferrer(document.referrer, window.location.host),
      );
    } catch {
      // sessionStorage non disponibile (navigazione privata, blocchi): niente provenienza.
    }
  }, []);
  return null;
}
