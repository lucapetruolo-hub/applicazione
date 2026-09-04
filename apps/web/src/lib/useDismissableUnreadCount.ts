"use client";

import { useState } from "react";

/**
 * Un pallino "Contatta/Cronologia" deve sparire non appena la conversazione
 * viene aperta (richiesta esplicita dell'utente: "ancora non si capisce
 * che è arrivato un nuovo messaggio da quella particolare richiesta") — ma
 * il conteggio arriva dal genitore come totale cumulativo dall'apertura
 * della pagina (poll additivo, `mergeCounts` in notificationSections.ts,
 * mai azzerato lì). Un `useState` locale ricorda "a quale totale ero
 * quando ho aperto l'ultima volta" e mostra solo la differenza: se
 * arrivano nuovi messaggi dopo aver chiuso la cronologia, il pallino torna
 * a comparire con il conteggio corretto invece di restare azzerato per
 * sempre o mostrare di nuovo l'intero storico.
 */
export function useDismissableUnreadCount(count: number | undefined): [number | undefined, () => void] {
  const [dismissedAt, setDismissedAt] = useState(0);
  const effective = count !== undefined ? Math.max(0, count - dismissedAt) : undefined;
  function dismiss() {
    setDismissedAt(count ?? 0);
  }
  return [effective, dismiss];
}
