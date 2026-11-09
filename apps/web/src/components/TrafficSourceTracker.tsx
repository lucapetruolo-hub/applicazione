"use client";

import { useEffect } from "react";
import { INVITE_PARAM, isInviteCode, trafficSourceFromReferrer } from "@professionisti/shared";
import { TRAFFIC_SOURCE_STORAGE_KEY } from "@/lib/storedTrafficSource";
import { INVITE_CODE_STORAGE_KEY } from "@/lib/storedInviteCode";

export { TRAFFIC_SOURCE_STORAGE_KEY };

/**
 * Ricorda da dove è arrivata la visita (Google, social, diretto...) alla
 * prima pagina aperta, per allegarla alla richiesta di preventivo: è il modo
 * di contare le richieste portate da Google. Solo la categoria, nella scheda
 * del browser e fino alla sua chiusura; nessun cookie, nessun dato personale.
 */
export function TrafficSourceTracker() {
  useEffect(() => {
    // Link d'invito di un collega o di un partner (docs/changelog/2026-11-09-passaparola.md):
    // vale l'ultimo aperto, fino alla chiusura della scheda.
    try {
      const invite = new URLSearchParams(window.location.search).get(INVITE_PARAM)?.trim().toLowerCase();
      if (invite && isInviteCode(invite)) window.sessionStorage.setItem(INVITE_CODE_STORAGE_KEY, invite);
    } catch {
      // sessionStorage non disponibile: l'iscrizione parte senza invito.
    }
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
