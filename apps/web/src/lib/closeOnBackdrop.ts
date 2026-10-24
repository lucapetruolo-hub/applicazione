import type { MouseEvent } from "react";

/**
 * Clic sullo sfondo scuro dietro una finestra (docs/CHANGELOG.md §315): la
 * chiude solo se il clic è sullo sfondo, fuori dalla finestra, così la
 * finestra non deve fermare i clic al suo interno. Lo sfondo ha
 * `role="presentation"` e il ruolo `dialog` va sulla finestra; con la
 * tastiera si chiude con Esc, gestito da ogni finestra.
 */
export function closeOnBackdrop(onClose: () => void) {
  return (event: MouseEvent<HTMLElement>) => {
    if (event.target === event.currentTarget) onClose();
  };
}
