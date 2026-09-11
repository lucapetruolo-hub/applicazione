import type { MetadataRoute } from "next";

/**
 * Web App Manifest (installabilità PWA): permette di "aggiungere alla
 * schermata Home" su Android/Chrome — pertinente per un marketplace
 * mobile-first dove i professionisti sono spesso sul campo con
 * connessione scarsa (CLAUDE.md §8). Nessun supporto offline reale oltre
 * al service worker minimale in `sw.js` (solo cache dell'app shell/pagine
 * già visitate, mai i dati — una ricerca/dashboard offline mostrerebbe
 * dati non aggiornati, inaccettabile per un marketplace, coerente con la
 * scelta già fatta altrove nel prodotto di servire sempre dati freschi).
 * Icone generate al volo da `icon-192.png`/`icon-512.png` (route handler
 * con `next/og`), stesso mark di `icon.svg`/`apple-icon.tsx` — nessun
 * binario committato a mano.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Professionisti — Trova un professionista vicino a te",
    short_name: "Professionisti",
    description: "Cerca imbianchini, elettricisti, idraulici e altri professionisti locali verificati vicino a te.",
    start_url: "/",
    display: "standalone",
    background_color: "#FDEFE1",
    theme_color: "#189A63",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
