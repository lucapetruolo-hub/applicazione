/**
 * Nome del cliente come lo vede un professionista (richiesta esplicita
 * dell'utente, docs/CHANGELOG.md §215): prima dell'accettazione del
 * preventivo solo il nome, il cognome si sblocca insieme a telefono e
 * indirizzo quando nasce la `Booking` (CLAUDE.md §5 punto 9). Il cognome
 * viene tolto qui, lato server, così non arriva mai al browser prima.
 */
export function clientNameForProfessional(client: { name: string | null; surname: string | null }, unlocked: boolean): string | null {
  const parts = unlocked ? [client.name, client.surname] : [client.name];
  return parts.map((part) => part?.trim()).filter(Boolean).join(" ") || null;
}
