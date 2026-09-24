/**
 * "Rispondi entro …" per un lead (CLAUDE.md §14): condiviso da Richieste e
 * lavori e dalla Home "Oggi" (docs/CHANGELOG.md §147). Gli orizzonti reali
 * sono brevi (20 minuti le urgenti, fino a 4 ore le standard), quindi
 * sempre minuti/ore. `null` se la scadenza è passata o non nota.
 */
export function formatLeadDeadline(expiresAt: string | null): { label: string; urgent: boolean } | null {
  if (!expiresAt) return null;
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  if (diffMs <= 0) return null;
  const diffMinutes = Math.ceil(diffMs / 60_000);
  // Urgente (bordo/testo rosso invece di ambra) sotto mezz'ora, a
  // prescindere dal tipo di richiesta — un margine sempre stretto,
  // indipendentemente da quanto tempo aveva a disposizione all'inizio.
  const urgent = diffMinutes <= 30;
  if (diffMinutes < 60) {
    return { label: `Rispondi entro ${diffMinutes} minut${diffMinutes === 1 ? "o" : "i"}`, urgent };
  }
  const diffHours = Math.ceil(diffMinutes / 60);
  return { label: `Rispondi entro ${diffHours} or${diffHours === 1 ? "a" : "e"}`, urgent };
}

/**
 * "N su M altri professionisti hanno già risposto" (docs/CHANGELOG.md §147,
 * decisione esplicita dell'utente): conta solo i preventivi degli altri
 * professionisti che hanno ricevuto la stessa richiesta, mai chi sono.
 * `null` se la richiesta è arrivata solo a te.
 */
export function formatCompetitors({ responded, total }: { responded: number; total: number }): string | null {
  if (total <= 0) return null;
  if (total === 1) return responded > 0 ? "L'altro professionista ha già risposto" : "L'altro professionista non ha ancora risposto";
  if (responded === 0) return `Nessuno degli altri ${total} professionisti ha ancora risposto`;
  return `${responded} su ${total} altri professionisti ${responded === 1 ? "ha" : "hanno"} già risposto`;
}
