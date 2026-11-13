"use client";

import { useEffect, useState } from "react";

/**
 * L'ora di adesso, aggiornata ogni minuto (allo scoccare del minuto): le frasi
 * su annullare e acconto cambiano da sole quando la pagina resta aperta e
 * passa la scadenza (docs/changelog/2026-11-13-annullare-pagina-aperta.md).
 * Va passata alle funzioni che guardano l'ora: senza, il React Compiler può
 * tenere il risultato di prima.
 */
export function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let interval: number | undefined;
    // Primo giro allo scoccare del minuto, così "fino alle 08:00" cambia alle 08:00 e non alle 08:00 e 59 secondi.
    const timeout = window.setTimeout(() => {
      setNow(new Date());
      interval = window.setInterval(() => setNow(new Date()), 60_000);
    }, 60_000 - (Date.now() % 60_000) + 50);
    // Tornando sulla scheda (telefono in tasca) si ricalcola subito.
    const onVisible = () => {
      if (document.visibilityState === "visible") setNow(new Date());
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(timeout);
      if (interval !== undefined) window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return now;
}
