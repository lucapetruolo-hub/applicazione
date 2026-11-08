import type { ReactNode } from "react";
import { ScrollView } from "tamagui";

export type AutocompleteListProps = {
  children: ReactNode;
  /** id dell'opzione evidenziata con le frecce: la lista la tiene in vista (sito). */
  activeOptionId?: string;
};

/**
 * Variante nativa (app): lista scorrevole alta al massimo 320 px. La
 * sfumatura con "Altre N", la barra sempre visibile e l'altezza secondo lo
 * spazio libero vivono in AutocompleteList.web.tsx
 * (docs/changelog/2026-11-07-liste-suggerimenti.md); l'app le avrà quando si
 * costruisce per intero.
 */
export function AutocompleteList({ children }: AutocompleteListProps) {
  return (
    <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator>
      {children}
    </ScrollView>
  );
}

/** Sul telefono il sito porta il campo in alto; nell'app ci pensa la tastiera. */
export function revealFieldForList(_field: unknown): void {}
