/**
 * Parole da cercare nel nome di un'attività senza badare alla desinenza
 * (richiesta di Luca, docs/changelog/2026-11-04-nomi-dei-mestieri.md):
 * "termoidraulico" trova "Termoidraulica Rossi", "idraulici" trova
 * "Idraulica Bianchi". Ogni parola di almeno 5 lettere perde la vocale
 * finale; le parole corte restano intere ("srl", "di"), così una sigla non
 * trova mezzo elenco. Il nome deve contenere tutte le parole, in qualunque
 * ordine.
 */
export function nameSearchWords(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) => (word.length >= 5 ? word.replace(/[aeiouàèéìíòóù]$/, "") : word))
    .slice(0, 6);
}
