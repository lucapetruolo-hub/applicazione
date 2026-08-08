/**
 * "Ha completato N interventi questo mese" (richiesta esplicita
 * dell'utente, contatore su card di ricerca e profilo pubblico): conta le
 * `Booking` con stato `COMPLETED` il cui `updatedAt` cade nel mese di
 * calendario corrente — nessun campo `completedAt` dedicato nello schema,
 * `updatedAt` si aggiorna già al momento della transizione a `COMPLETED`
 * (`BookingsService.updateStatus`/`completeWithFinalAmount`), quindi è un
 * proxy reale e accurato senza richiedere una migrazione. Usato da
 * `ProfessionalsService.search`/`getById` e da
 * `SavedProfessionalsService.listForUser` — gli stessi tre punti che già
 * costruiscono un `ProfessionalSearchResult` (CLAUDE.md §19).
 */
export function countCompletedThisMonth(bookings: { status: string; updatedAt: Date }[]): number {
  const now = new Date();
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const nextMonthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  return bookings.filter(
    (booking) => booking.status === "COMPLETED" && booking.updatedAt.getTime() >= monthStart && booking.updatedAt.getTime() < nextMonthStart,
  ).length;
}
