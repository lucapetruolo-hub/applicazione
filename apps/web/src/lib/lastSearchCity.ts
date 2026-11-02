/**
 * Città dell'ultima ricerca fatta su questo browser (docs/CHANGELOG.md §398):
 * le voci di "Quanto costa in media" aprono l'elenco già in quella zona.
 * Dal 02/11/2026 la stessa città sta anche in un cookie tecnico con lo
 * stesso nome, letto dal server della home per mettere prima le categorie
 * con più professionisti vicino (docs/changelog/2026-11-02-categorie-telefono.md):
 * così le schede arrivano già in ordine, senza spostarsi. Solo una comodità
 * di chi visita, mai usata per contare né salvata dal server: se il browser
 * non la salva, la voce apre l'elenco senza città e la home usa tutta Italia.
 */
const KEY = "ultima_citta_cercata";
/** Nome del cookie letto dalla home (`app/page.tsx`). */
export const LAST_SEARCH_CITY_COOKIE = KEY;
/** Un anno, come "Non contare questo browser". */
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

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
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${KEY}=${encodeURIComponent(value.slice(0, 80))}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax${secure}`;
}
