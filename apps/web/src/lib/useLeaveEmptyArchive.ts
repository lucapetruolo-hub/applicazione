import { useState } from "react";

/**
 * Quando si ripristina l'ultima richiesta archiviata, la scheda "Archiviate"
 * resta vuota: si torna da soli a "Tutte", dove il messaggio "Richiesta
 * ripristinata: la trovi di nuovo in Tutte" dice che è finita
 * (docs/changelog/2026-11-10-ripristino-pagina-bloccata.md). Scatta solo nel
 * passaggio da almeno una a zero archiviate: aprire "Archiviate" quando è
 * già vuota la lascia aperta.
 *
 * Aggiorna lo stato durante il disegno (schema "valore del giro prima" di
 * React), così non si vede neanche per un attimo la scheda vuota.
 */
export function useLeaveEmptyArchive<T extends string>(archivedCount: number | null, activeTab: T, setActiveTab: (tab: T) => void, allTab: T) {
  const [previousCount, setPreviousCount] = useState(archivedCount);
  if (archivedCount !== previousCount) {
    setPreviousCount(archivedCount);
    if (archivedCount === 0 && previousCount !== null && previousCount > 0 && activeTab === "archiviate") setActiveTab(allTab);
  }
}
