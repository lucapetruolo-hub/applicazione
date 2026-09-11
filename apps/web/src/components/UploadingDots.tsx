"use client";

import { brand } from "@professionisti/ui";

/**
 * Tre pallini che rimbalzano in sequenza (richiesta esplicita dell'utente:
 * "quando si carica qualcosa dai un segnale all'utente che stai caricando,
 * ad esempio con un'animazione dei pallini") — sostituisce il "…" statico
 * usato prima in ogni punto del sito con un upload di foto/video/documento
 * in corso. Dimensione regolabile (`dotSize`) per adattarsi sia al
 * riquadro "+" delle gallerie (16px) sia a un'etichetta di bottone più
 * grande (account/dashboard-profilo, dove sostituisce "Caricamento...").
 * Animazione CSS pura (`globals.css`, `.uploading-dots`/`.uploading-dot`),
 * rispetta `prefers-reduced-motion` tramite la regola globale già esistente
 * in quel file — nessun guard aggiuntivo qui.
 */
export function UploadingDots({ dotSize = 6, color = brand.grafite70 }: { dotSize?: number; color?: string }) {
  return (
    <span className="uploading-dots" role="status" aria-label="Caricamento in corso">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="uploading-dot"
          style={{ width: dotSize, height: dotSize, backgroundColor: color }}
        />
      ))}
    </span>
  );
}
