"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Ricerca nelle richieste di cliente e professionista
 * (docs/changelog/2026-11-11-ricerca-fuori-dai-filtri.md): non tiene conto di
 * maiuscole, accenti e apostrofi curvi ("perdita" trova "Perdità", "d'acqua"
 * trova "d’acqua"), e la parola trovata si evidenzia nelle schede.
 */

/**
 * Minuscole, senza accenti, apostrofo dritto. Ogni lettera resta una lettera
 * (testo in NFC): le posizioni sono le stesse del testo di partenza, così si
 * può evidenziare il pezzo giusto.
 */
export function foldSearchText(text: string): string {
  let out = "";
  for (const ch of text.normalize("NFC")) {
    if (ch === "’" || ch === "‘") {
      out += "'";
      continue;
    }
    const base = ch.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    const lower = ch.toLowerCase();
    out += base.length === ch.length ? base : lower.length === ch.length ? lower : ch;
  }
  return out;
}

/** La ricerca, già pulita: vuota se non si cerca niente. */
export function searchQuery(search: string): string {
  return foldSearchText(search.trim());
}

/** Vero se il testo contiene la ricerca (passata da `searchQuery`). */
export function matchesSearch(text: string | null | undefined, query: string): boolean {
  return !query || (!!text && foldSearchText(text).includes(query));
}

/** Giallo chiaro da evidenziatore: il testo scuro resta leggibile (contrasto oltre 12:1). */
const HIGHLIGHT = "#FFE58A";

const SearchHighlightContext = createContext("");

/** Dà alle schede dell'elenco la ricerca in corso, da evidenziare. */
export function SearchHighlightProvider({ query, children }: { query: string; children: ReactNode }) {
  return <SearchHighlightContext.Provider value={query}>{children}</SearchHighlightContext.Provider>;
}

/** La ricerca in corso (già pulita), vuota fuori dall'elenco. */
export function useSearchHighlight(): string {
  return useContext(SearchHighlightContext);
}

/** Il testo con le parti che corrispondono alla ricerca evidenziate in giallo. */
export function HighlightMatch({ text }: { text: string }) {
  const query = useSearchHighlight();
  if (!query) return <>{text}</>;
  const original = text.normalize("NFC");
  const folded = foldSearchText(original);
  if (folded.length !== original.length) return <>{text}</>;
  const parts: ReactNode[] = [];
  let from = 0;
  let at = folded.indexOf(query);
  while (at !== -1) {
    if (at > from) parts.push(original.slice(from, at));
    parts.push(
      <mark key={at} style={{ backgroundColor: HIGHLIGHT, color: "inherit", borderRadius: 3, padding: "0 1px" }}>
        {original.slice(at, at + query.length)}
      </mark>,
    );
    from = at + query.length;
    at = folded.indexOf(query, from);
  }
  if (parts.length === 0) return <>{text}</>;
  if (from < original.length) parts.push(original.slice(from));
  return <>{parts}</>;
}
