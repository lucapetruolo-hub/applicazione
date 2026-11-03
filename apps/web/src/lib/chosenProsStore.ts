import { MAX_CHOSEN_PROFESSIONALS, isProfessionalCategorySlug, type ProfessionalCategorySlug } from "@professionisti/shared";
import type { ChosenPro } from "@/components/ChosenProsBar";

/**
 * Professionisti scelti con "Scegli" nei risultati dal problema
 * (docs/changelog/2026-11-03-scelti-restano.md): restano nella scheda del
 * browser (sessionStorage, nessun cookie) così aprendo un profilo e tornando
 * indietro la scelta non si perde. Una sola ricerca alla volta: una nuova
 * descrizione, città o mestiere riparte da zero.
 */
export type ChosenSearch = {
  /** Mestiere, città e descrizione: identifica la ricerca. */
  key: string;
  /** Indirizzo dei risultati, per "Torna ai risultati" dal profilo. */
  url: string;
  /** Per la richiesta ai scelti anche dal profilo. */
  category: ProfessionalCategorySlug;
  description: string;
  city?: string;
  chosen: ChosenPro[];
};

const STORAGE_KEY = "scelti_ricerca";

/** Parametro del profilo aperto da risultati con "Scegli". */
export const CHOICE_PROFILE_PARAM = "scelta";

export function chosenSearchKey(category: string, city: string | undefined, description: string): string {
  return `${category}|${(city ?? "").trim().toLowerCase()}|${description.trim()}`;
}

export function readChosenSearch(): ChosenSearch | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<ChosenSearch>;
    if (
      typeof value.key !== "string" ||
      typeof value.url !== "string" ||
      !value.url.startsWith("/cerca") ||
      typeof value.category !== "string" ||
      !isProfessionalCategorySlug(value.category) ||
      typeof value.description !== "string" ||
      !Array.isArray(value.chosen)
    ) {
      return null;
    }
    return {
      key: value.key,
      url: value.url,
      category: value.category,
      description: value.description,
      city: typeof value.city === "string" ? value.city : undefined,
      chosen: value.chosen.slice(0, MAX_CHOSEN_PROFESSIONALS),
    };
  } catch {
    return null;
  }
}

export function writeChosenSearch(search: ChosenSearch) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(search));
  } catch {
    // Senza sessionStorage la scelta vale solo finché si resta sulla pagina.
  }
}

/** Aggiunge o toglie un professionista; oltre il massimo non cambia nulla. */
export function toggleChosenPro(current: ChosenPro[], pro: ChosenPro): ChosenPro[] {
  if (current.some((item) => item.id === pro.id)) return current.filter((item) => item.id !== pro.id);
  return current.length < MAX_CHOSEN_PROFESSIONALS ? [...current, pro] : current;
}
