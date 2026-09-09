const NEW_PROFILE_WINDOW_DAYS = 30;

/**
 * Un profilo pubblico è considerato "nuovo" (badge "Nuovo profilo",
 * richiesta esplicita dell'utente — "Verbale Cognitivo" F3.1: "un profilo
 * appena creato appare 'vuoto', non 'nuovo'") per i primi 30 giorni dalla
 * creazione, indipendentemente da quanto il professionista ha già
 * compilato nel frattempo (bio, prestazioni, portfolio, recensioni) —
 * chiarimento esplicito dell'utente: il badge resta visibile "a
 * prescindere dalle informazioni aggiunte", non sparisce al primo campo
 * riempito. Stessa soglia di 30 giorni già in uso altrove nel prodotto
 * per "Nuovo" (badge sulle notifiche per sezione, CLAUDE.md §19).
 */
export function computeIsNewProfile(createdAt: Date): boolean {
  const ageMs = Date.now() - createdAt.getTime();
  return ageMs <= NEW_PROFILE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}
