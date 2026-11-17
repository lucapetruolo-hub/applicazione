"use client";

import { useEffect, useMemo, useState } from "react";
import { MAX_CHOSEN_PROFESSIONALS, type ProfessionalCategorySlug, type ProfessionalSearchResult } from "@professionisti/shared";
import type { ChosenPro } from "@/components/ChosenProsBar";
import { chosenSearchKey, readChosenSearch, toggleChosenPro, writeChosenSearch } from "@/lib/chosenProsStore";

/** Quanto resta visibile "Puoi sceglierne al massimo 5". */
export const LIMIT_NOTICE_MS = 4000;

/** Quanto resta "Annulla" dopo la X o "Togli tutti" (docs/changelog/2026-11-16-anteprima-scelti.md). */
export const UNDO_MS = 6000;

/** Ultima cosa tolta con la X o "Togli tutti", per rimetterla con "Annulla". */
export type ChosenUndo = { text: string; list: ChosenPro[]; at: number };

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

  function toggle(pro: ProfessionalSearchResult, requestCategory?: ProfessionalCategorySlug) {
    if (!key) return;
    // Dopo un nuovo «Scegli» l'"Annulla" toglierebbe anche questo: sparisce.
    setUndoState(null);
    setState((current) => ({
      key,
      list: toggleChosenPro(current.key === key ? current.list : [], {
        id: pro.id,
        businessName: pro.businessName,
        imageUrl: pro.imageUrl ?? null,
        categorySlug: pro.categorySlug,
        categoryLabel: pro.categoryLabel,
        city: pro.city,
        rating: pro.rating,
        reviewCount: pro.reviewCount,
        ...(requestCategory && requestCategory !== category ? { requestCategory } : {}),
      }),
    }));
  }

  // `requestCategory`: per le schede di "Potrebbe farlo anche…", scelte per l'altro
  // mestiere proposto (docs/changelog/2026-11-17-scelti-due-mestieri.md).
  const selectionFor = (requestCategory?: ProfessionalCategorySlug) =>
    key
      ? {
          selectedIds: new Set(chosen.map((pro) => pro.id)),
          canAdd: chosen.length < MAX_CHOSEN_PROFESSIONALS,
          max: MAX_CHOSEN_PROFESSIONALS,
          onToggle: (pro: ProfessionalSearchResult) => toggle(pro, requestCategory),
          onBlocked: () => setLimitAt(Date.now()),
        }
      : undefined;
  const selection = selectionFor();
  // La X sull'anteprima del singolo scelto e "Togli tutti", con "Annulla" per
  // qualche secondo se toccati per sbaglio (docs/changelog/2026-11-16-anteprima-scelti.md).
  const [undoState, setUndoState] = useState<ChosenUndo | null>(null);
  useEffect(() => {
    if (!undoState) return;
    const timer = setTimeout(() => setUndoState(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [undoState]);
  // Un "Annulla" vale solo per la ricerca in cui si è tolto.
  const undoInfo = undoState && state.key === key ? undoState : null;
  function remove(id: string) {
    if (!key) return;
    const pro = chosen.find((item) => item.id === id);
    if (!pro) return;
    setUndoState({ text: `Hai tolto ${pro.businessName}.`, list: chosen, at: Date.now() });
    setState({ key, list: chosen.filter((item) => item.id !== id) });
  }
  function clear() {
    if (chosen.length > 0) setUndoState({ text: chosen.length === 1 ? `Hai tolto ${chosen[0]!.businessName}.` : `Hai tolto ${chosen.length} professionisti.`, list: chosen, at: Date.now() });
    setState({ key, list: [] });
  }
  function undo() {
    if (!key || !undoInfo) return;
    setState({ key, list: undoInfo.list.slice(0, MAX_CHOSEN_PROFESSIONALS) });
    setUndoState(null);
  }

  return { chosen, clear, remove, undo: undoInfo ? { text: undoInfo.text, onUndo: undo } : null, selection, selectionFor, limitNotice: limitAt !== null ? chosenLimitText() : null };
}
