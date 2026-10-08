import { useEffect, useRef } from "react";
import { subscribeRealtimeEvents } from "./realtimeBus";

/**
 * Ricarica i dati di una pagina "in attesa" (Home "Oggi", "Richieste e
 * lavori") quando succede qualcosa, senza ricaricare la pagina: bug
 * segnalato dall'utente, arrivava il popup della nuova richiesta ma la
 * pagina Oggi restava ferma finché non la si ricaricava a mano.
 *
 * Stesso canale del popup (l'evento `notification` dell'SSE, inoltrato da
 * `AuthContext` al `realtimeBus`), più due reti di sicurezza: al ritorno
 * sulla scheda (computer in standby, connessione SSE caduta) e un giro di
 * riserva ogni `fallbackMs` mentre la scheda è visibile, per le notifiche
 * che non passano dall'SSE (argomento spento sul canale "sito"). Le pagine
 * che hanno già un loro poll passano `fallbackMs = null`.
 */
export function useLiveRefresh(refresh: () => void, enabled: boolean, fallbackMs: number | null = 120_000): void {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!enabled) return;
    const run = () => refreshRef.current();
    const unsubscribe = subscribeRealtimeEvents((event) => {
      if (event.kind === "notification") run();
    });
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", run);
    const interval =
      fallbackMs === null
        ? undefined
        : setInterval(() => {
            if (document.visibilityState === "visible") run();
          }, fallbackMs);
    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", run);
      clearInterval(interval);
    };
  }, [enabled, fallbackMs]);
}
