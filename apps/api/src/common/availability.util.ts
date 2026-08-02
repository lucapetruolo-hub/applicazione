/**
 * Una fascia (`AvailabilitySlot`) vale per una data esatta se `date` è
 * valorizzato (nuovo comportamento di default — richiesta esplicita
 * dell'utente: aggiungere una fascia la lega a quella data specifica, non
 * più a "ogni <dayOfWeek> per sempre"), altrimenti ricorre ogni settimana
 * per `dayOfWeek` (comportamento storico, ancora supportato per le fasce
 * create prima di questa funzionalità). Unico punto di verità per questo
 * confronto, riusato da tutte le proiezioni dell'agenda (getMyAvailableSlots,
 * getMyAvailability, getPublicAgenda, buildAvailabilityPreviews) invece di
 * ripetere la stessa logica in ognuna.
 */
export function slotAppliesOnDate(slot: { dayOfWeek: number; date: Date | null }, date: Date): boolean {
  if (slot.date) {
    return slot.date.toISOString().slice(0, 10) === date.toISOString().slice(0, 10);
  }
  return slot.dayOfWeek === date.getUTCDay();
}
