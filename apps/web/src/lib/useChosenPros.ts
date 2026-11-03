"use client";

import { useEffect, useState } from "react";
import { MAX_CHOSEN_PROFESSIONALS, type ProfessionalCategorySlug, type ProfessionalSearchResult } from "@professionisti/shared";
import type { ChosenPro } from "@/components/ChosenProsBar";
import { chosenSearchKey, readChosenSearch, toggleChosenPro, writeChosenSearch } from "@/lib/chosenProsStore";

/**
 * "Scegli" sulle schede dei risultati, uguale nella ricerca per problema
 * (docs/CHANGELOG.md §393) e in quella per mestiere
 * (docs/changelog/2026-11-03-scegli-ricerca-mestiere.md). La scelta resta
 * aprendo un profilo e tornando indietro
 * (docs/changelog/2026-11-03-scelti-restano.md): si legge dopo il montaggio,
 * perché nel render del server non c'è, e si salva a ogni cambio.
 *
 * `category` null: niente da scegliere (mestiere non deciso o meno di due
 * professionisti). `scope` distingue ricerche con lo stesso mestiere e la
 * stessa città: la descrizione del problema, o la specializzazione della
 * pagina per servizio.
 */
export function useChosenPros({
  category,
  city,
  description,
  scope,
  professionals,
}: {
  category: ProfessionalCategorySlug | null;
  city: string | undefined;
  /** Descrizione del problema da portare nel modulo; vuota nella ricerca per mestiere. */
  description: string;
  scope: string;
  professionals: ProfessionalSearchResult[];
}) {
  const [chosen, setChosen] = useState<ChosenPro[]>([]);
  const key = category ? chosenSearchKey(category, city, scope) : null;
  const [restoredKey, setRestoredKey] = useState<string | null>(null);
  useEffect(() => {
    if (!key) return;
    const saved = readChosenSearch();
    const ids = new Set(professionals.map((pro) => pro.id));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChosen(saved?.key === key ? saved.chosen.filter((pro) => ids.has(pro.id)) : []);
    setRestoredKey(key);
  }, [key, professionals]);
  useEffect(() => {
    if (!key || restoredKey !== key || !category) return;
    writeChosenSearch({ key, url: `${window.location.pathname}${window.location.search}`, category, description, city, chosen });
  }, [key, restoredKey, chosen, category, description, city]);

  function toggle(pro: ProfessionalSearchResult) {
    setChosen((current) =>
      toggleChosenPro(current, { id: pro.id, businessName: pro.businessName, imageUrl: pro.imageUrl ?? null, categorySlug: pro.categorySlug }),
    );
  }

  const selection = key
    ? {
        selectedIds: new Set(chosen.map((pro) => pro.id)),
        canAdd: chosen.length < MAX_CHOSEN_PROFESSIONALS,
        max: MAX_CHOSEN_PROFESSIONALS,
        onToggle: toggle,
      }
    : undefined;
  return { chosen, clear: () => setChosen([]), selection };
}
