import type { MouseEvent } from "react";

/**
 * Foto e video caricati da clienti e professionisti non si scaricano dal sito
 * (decisione di Luca del 18/11, docs/changelog/2026-11-18-video-massimo-un-minuto.md):
 * niente "Salva immagine/video" col tasto destro, niente trascinamento sul
 * desktop. Insieme a `controlsList="nodownload"` sui video e alla classe
 * `no-save-media` (niente menu "Salva" tenendo premuto su iPhone). Una foto
 * dello schermo resta sempre possibile: nessun sito la può impedire.
 */
export const noSaveProps = {
  className: "no-save-media",
  draggable: false,
  onContextMenu: (event: MouseEvent) => event.preventDefault(),
};
