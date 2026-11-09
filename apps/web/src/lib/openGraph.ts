import type { Metadata } from "next";
import { BRAND } from "@professionisti/shared";

/**
 * Anteprima dei link (WhatsApp, Facebook, Telegram): nome del sito, lingua e
 * tipo su ogni pagina (collaudo 08/11 E8-06,
 * docs/changelog/2026-11-08-seo-e-velocita.md). Una pagina che scrive il suo
 * `openGraph` sostituisce per intero quello del layout (Next.js non li
 * unisce), per questo passa sempre da `openGraphFor`.
 */
export const BASE_OPEN_GRAPH = {
  type: "website",
  siteName: BRAND.name,
  locale: "it_IT",
} as const satisfies Metadata["openGraph"];

/**
 * `openGraph` di una pagina: i dati comuni, il suo indirizzo (relativo,
 * completato da `metadataBase`) e l'immagine del sito (`app/opengraph-image.tsx`),
 * che altrimenti le pagine in una cartella perdono scrivendo il loro
 * `openGraph`. Il profilo ha la sua immagine (`professionista/[id]/opengraph-image.tsx`),
 * che vince su questa.
 */
export function openGraphFor(path: string): NonNullable<Metadata["openGraph"]> {
  return { ...BASE_OPEN_GRAPH, url: path, images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: BRAND.name }] };
}
