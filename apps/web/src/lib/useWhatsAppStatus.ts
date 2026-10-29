"use client";

import { useEffect, useState } from "react";
import type { WhatsAppStatus } from "@professionisti/shared";
import { apiClient } from "@/lib/apiClient";

// Una sola lettura per pagina anche con più schede (più appuntamenti nella lista).
let cached: { token: string; promise: Promise<WhatsAppStatus | null> } | null =
  null;

/**
 * Stato dei promemoria su WhatsApp di chi è entrato, per i richiami fuori da
 * Notifiche (docs/changelog/2026-10-28-promemoria-whatsapp.md). Null finché
 * non risponde o se la lettura non riesce: in quel caso non si mostra nulla.
 */
export function useWhatsAppStatus(token: string | null): WhatsAppStatus | null {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  useEffect(() => {
    if (!token) return;
    if (!cached || cached.token !== token) {
      cached = {
        token,
        promise: apiClient.whatsAppStatus(token).catch(() => null),
      };
    }
    let active = true;
    void cached.promise.then((next) => {
      if (active) setStatus(next);
    });
    return () => {
      active = false;
    };
  }, [token]);
  return status;
}

/** Dopo un cambio in Notifiche (codice confermato, acceso, spento): la prossima pagina rilegge. */
export function forgetWhatsAppStatus(): void {
  cached = null;
}
