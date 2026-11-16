"use client";

import { useEffect, useMemo, useState } from "react";
import { MAX_CHOSEN_PROFESSIONALS, type ProfessionalCategorySlug, type ProfessionalSearchResult } from "@professionisti/shared";
import type { ChosenPro } from "@/components/ChosenProsBar";
import { chosenSearchKey, readChosenSearch, toggleChosenPro, writeChosenSearch } from "@/lib/chosenProsStore";

/** Quanto resta visibile "Puoi sceglierne al massimo 5". */
export const LIMIT_NOTICE_MS = 4000;

export function chosenLimitText(): string {
  return `Puoi sceglierne al massimo ${MAX_CHOSEN_PROFESSIONALS}.`;
}

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
}: {
  category: ProfessionalCategorySlug | null;
  city: string | undefined;
  /** Descrizione del problema da portare nel modulo; vuota nella ricerca per mestiere. */
  description: string;
  scope: string;
}) {
  // Scelti insieme alla ricerca a cui appartengono: una ricerca nuova parte vuota.
  const [state, setState] = useState<{ key: string | null; list: ChosenPro[] }>({ key: null, list: [] });
  // Tocco su "Scegli" oltre il massimo: un avviso visibile per qualche
  // secondo, anche da telefono (docs/changelog/2026-11-04-esempi-cercano-subito.md).
  const [limitAt, setLimitAt] = useState<number | null>(null);
  useEffect(() => {
    if (limitAt === null) return;
    const timer = setTimeout(() => setLimitAt(null), LIMIT_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [limitAt]);
  const key = category ? chosenSearchKey(category, city, scope) : null;
  // Scelti di questa ricerca, anche da altre pagine dei risultati
  // (docs/changelog/2026-11-16-pagine-da-20.md): prima si tenevano solo quelli
  // ancora nella lista, che ora ha 20 schede per pagina. Un profilo sparito
  // nel frattempo lo scarta la richiesta stessa.
  const chosen = useMemo(() => (key !== null && state.key === key ? state.list : []), [key, state]);
  const [restoredKey, setRestoredKey] = useState<string | null>(null);
  useEffect(() => {
    if (!key) return;
    const saved = readChosenSearch();
    const restored = saved?.key === key ? saved.chosen : [];
    // Un "Scegli" toccato appena aperta la pagina, prima di questo ripristino,
    // non si perde: si aggiunge ai salvati invece di essere sostituito
    // (docs/changelog/2026-11-10-prove-che-falliscono-in-locale.md).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState((current) => {
      const touched = current.key === key ? current.list : [];
      const merged = [...restored, ...touched.filter((pro) => !restored.some((item) => item.id === pro.id))];
      return { key, list: merged.slice(0, MAX_CHOSEN_PROFESSIONALS) };
    });
    setRestoredKey(key);
  }, [key]);
  useEffect(() => {
    if (!key || restoredKey !== key || !category) return;
    writeChosenSearch({ key, url: `${window.location.pathname}${window.location.search}`, category, description, city, chosen });
  }, [key, restoredKey, chosen, category, description, city]);

  function toggle(pro: ProfessionalSearchResult) {
    if (!key) return;
    setState((current) => ({
      key,
      list: toggleChosenPro(current.key === key ? current.list : [], {
        id: pro.id,
        businessName: pro.businessName,
        imageUrl: pro.imageUrl ?? null,
        categorySlug: pro.categorySlug,
      }),
    }));
  }

  const selection = key
    ? {
        selectedIds: new Set(chosen.map((pro) => pro.id)),
        canAdd: chosen.length < MAX_CHOSEN_PROFESSIONALS,
        max: MAX_CHOSEN_PROFESSIONALS,
        onToggle: toggle,
        onBlocked: () => setLimitAt(Date.now()),
      }
    : undefined;
  return { chosen, clear: () => setState({ key, list: [] }), selection, limitNotice: limitAt !== null ? chosenLimitText() : null };
}
