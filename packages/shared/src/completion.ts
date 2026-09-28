/**
 * Differenze tra preventivo e importo finale di un lavoro terminato
 * (richiesta esplicita dell'utente, docs/CHANGELOG.md §163): se il
 * professionista aggiunge voci non preventivate o il totale esce dalla
 * fascia del preventivo, deve motivarlo. Stessa regola nel modulo (per
 * mostrare il campo) e sul server (per rifiutare l'invio senza motivo).
 */

export type QuotedItemRange = { name: string; priceMinEurCents: number | null; priceMaxEurCents: number | null };
export type FinalItemAmount = { name: string; priceEurCents: number };

export type CompletionDeviation = {
  /** Voci finali che non erano nel preventivo. */
  addedItemNames: string[];
  /** Fascia del preventivo: minimo e massimo sommati; massimo null se una voce era "su richiesta". */
  quoteMinEurCents: number;
  quoteMaxEurCents: number | null;
  totalEurCents: number;
  /** Totale sopra o sotto la fascia del preventivo. */
  direction: "ABOVE" | "BELOW" | null;
  needsReason: boolean;
};

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/** Null senza preventivo (prenotazione diretta dall'agenda): niente da confrontare. */
export function completionDeviation(quotedItems: QuotedItemRange[], finalItems: FinalItemAmount[]): CompletionDeviation | null {
  if (quotedItems.length === 0) return null;
  const quotedNames = new Set(quotedItems.map((item) => normalizeName(item.name)));
  const addedItemNames = finalItems.filter((item) => !quotedNames.has(normalizeName(item.name))).map((item) => item.name.trim());
  let quoteMinEurCents = 0;
  let quoteMaxEurCents: number | null = 0;
  for (const item of quotedItems) {
    const low = item.priceMinEurCents ?? item.priceMaxEurCents;
    const high = item.priceMaxEurCents ?? item.priceMinEurCents;
    quoteMinEurCents += low ?? 0;
    quoteMaxEurCents = high === null || high === undefined || quoteMaxEurCents === null ? null : quoteMaxEurCents + high;
  }
  const totalEurCents = finalItems.reduce((sum, item) => sum + item.priceEurCents, 0);
  const direction =
    quoteMaxEurCents !== null && totalEurCents > quoteMaxEurCents ? "ABOVE" : totalEurCents < quoteMinEurCents ? "BELOW" : null;
  return {
    addedItemNames,
    quoteMinEurCents,
    quoteMaxEurCents,
    totalEurCents,
    direction,
    needsReason: addedItemNames.length > 0 || direction !== null,
  };
}

/** Frase breve che spiega cosa va motivato, es. "Hai aggiunto 1 voce e il totale è più alto del preventivo". */
export function completionDeviationText(deviation: CompletionDeviation): string {
  const parts: string[] = [];
  if (deviation.addedItemNames.length > 0) {
    const count = deviation.addedItemNames.length;
    parts.push(count === 1 ? "hai aggiunto 1 voce non preventivata" : `hai aggiunto ${count} voci non preventivate`);
  }
  if (deviation.direction === "ABOVE") parts.push("il totale è più alto del preventivo");
  if (deviation.direction === "BELOW") parts.push("il totale è più basso del preventivo");
  const text = parts.join(" e ");
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}
