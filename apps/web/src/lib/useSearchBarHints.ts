"use client";

import { useEffect, useMemo, useState } from "react";
import { FRAZIONI, PROFESSIONAL_CATEGORIES, allItalianCityNames, nearestComune } from "@professionisti/shared";
import type { ProfessionalSuggestion } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { cachedPopularOrder, loadPopularOrder } from "@/lib/categoryOrder";
import { buildSearchSuggestions } from "@/lib/searchSuggestions";

/*
 * Suggerimenti della barra di ricerca (docs/CHANGELOG.md §383, richieste
 * dell'utente): al clic su "Cosa cerchi" i lavori più cercati prima; al clic
 * su "Città" "Vicino a me", l'ultima città usata e le più cercate; mentre si
 * scrive, prima le città con professionisti del lavoro scelto (senza numeri).
 */

const LAST_CITY_KEY = "ricerca:ultima-citta";

type CityHints = { popular: string[]; covered: string[] };
const cityHintsCache = new Map<string, Promise<CityHints | null>>();

function loadCityHints(category: string | undefined): Promise<CityHints | null> {
  const key = category ?? "";
  let entry = cityHintsCache.get(key);
  if (!entry) {
    entry = apiClient.getCityHints(category).catch(() => {
      // Un errore non resta in memoria: al prossimo cambio si riprova.
      cityHintsCache.delete(key);
      return null;
    });
    cityHintsCache.set(key, entry);
  }
  return entry;
}

function readLastCity(): string | null {
  try {
    return window.localStorage.getItem(LAST_CITY_KEY);
  } catch {
    return null;
  }
}

/** Da chiamare quando si cerca: la città torna prima la volta dopo. */
export function rememberSearchCity(city: string): void {
  const trimmed = city.trim();
  if (!trimmed) return;
  try {
    window.localStorage.setItem(LAST_CITY_KEY, trimmed);
  } catch {
    // Navigazione privata o memoria piena: si fa senza.
  }
}

/** Posizione del dispositivo → nome del comune, o `null` (permesso negato, nessun segnale, 10 secondi). */
function locateComune(): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(nearestComune(position.coords.latitude, position.coords.longitude)?.name ?? null),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 10 * 60_000 },
    );
  });
}

function categorySlugFor(query: string): string | undefined {
  const normalized = query.trim().toLowerCase();
  return PROFESSIONAL_CATEGORIES.find((category) => category.label.toLowerCase() === normalized)?.slug;
}

export function useSearchBarHints(initialQuery = "") {
  const [query, setQuery] = useState(initialQuery);
  const [order, setOrder] = useState(() => cachedPopularOrder() ?? null);
  const [hints, setHints] = useState<CityHints | null>(null);
  // Non mostrata finché non si apre l'elenco: leggerla subito non cambia la pagina generata dal server.
  const [lastCity] = useState<string | null>(() => (typeof window === "undefined" ? null : readLastCity()));
  const category = categorySlugFor(query);

  // La barra in alto resta montata cambiando pagina: si riparte dal lavoro della nuova pagina.
  const [previousInitialQuery, setPreviousInitialQuery] = useState(initialQuery);
  if (previousInitialQuery !== initialQuery) {
    setPreviousInitialQuery(initialQuery);
    setQuery(initialQuery);
  }

  useEffect(() => {
    let active = true;
    void loadPopularOrder().promise.then((value) => {
      if (active) setOrder(value);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void loadCityHints(category).then((value) => {
      if (active) setHints(value);
    });
    return () => {
      active = false;
    };
  }, [category]);

  const professionalSuggestions = useMemo<ProfessionalSuggestion[]>(() => {
    const suggestions = buildSearchSuggestions();
    if (!order) return suggestions;
    const rank = new Map<string, number>(order.map((slug, index) => [slug, index]));
    return [...suggestions].sort((a, b) => (rank.get(a.categorySlug) ?? 99) - (rank.get(b.categorySlug) ?? 99));
  }, [order]);

  const cityDefaults = useMemo(() => {
    const list = [lastCity, ...(hints?.popular ?? [])].filter((city): city is string => !!city);
    return [...new Set(list)].slice(0, 6);
  }, [lastCity, hints]);

  return {
    professionalSuggestions,
    citySuggestions: allItalianCityNames(),
    cityAliases: FRAZIONI,
    cityDefaults,
    preferredCities: hints?.covered ?? [],
    onNearMe: locateComune,
    onQueryChange: setQuery,
  };
}
