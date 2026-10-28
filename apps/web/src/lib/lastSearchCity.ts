/**
 * Città dell'ultima ricerca fatta su questo browser (docs/CHANGELOG.md §398):
 * le voci di "Quanto costa in media" aprono l'elenco già in quella zona.
 * Solo una comodità di chi visita, mai inviata al server né usata per
 * contare: se il browser non la salva, la voce apre l'elenco senza città.
 */
const KEY = "ultima_citta_cercata";

export function readLastSearchCity(): string | null {
  try {
    return window.localStorage.getItem(KEY)?.trim() || null;
  } catch {
    return null;
  }
}

export function saveLastSearchCity(city: string | undefined): void {
  const value = city?.trim();
  if (!value) return;
  try {
    window.localStorage.setItem(KEY, value.slice(0, 80));
  } catch {
    // Senza localStorage la voce apre l'elenco senza città: va bene lo stesso.
  }
}
