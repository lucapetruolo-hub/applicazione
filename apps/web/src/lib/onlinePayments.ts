"use client";

import { useEffect, useState } from "react";
import { apiClient } from "./apiClient";

let cached: Promise<boolean> | null = null;

function loadOnlinePayments(): Promise<boolean> {
  if (!cached) {
    cached = apiClient
      .getFeatures()
      .then((features) => features.onlinePayments)
      .catch(() => {
        cached = null;
        return false;
      });
  }
  return cached;
}

/**
 * Il pagamento online dei lavori è attivo? (docs/CHANGELOG.md §170)
 * Lo decide il server (chiave Stripe presente). Finché la risposta non
 * arriva, o se il server non risponde, vale `false`: il sito non promette mai
 * custodia dei soldi e rimborsi che non può dare.
 */
export function useOnlinePayments(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let alive = true;
    void loadOnlinePayments().then((value) => {
      if (alive) setEnabled(value);
    });
    return () => {
      alive = false;
    };
  }, []);
  return enabled;
}
