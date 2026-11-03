/**
 * Durata massima di "Metti in pausa" (collaudo C-16), in giorni: oltre
 * conviene chiudere l'account o l'abbonamento.
 *
 * In un file suo e non in `schemas.ts`: il riquadro della pausa in Oggi e in
 * Agenda importava solo questo numero e si portava dietro tutti gli schemi di
 * zod, creati all'apertura di ogni pagina (docs/changelog/2026-11-02-oggi-piu-leggera.md).
 */
export const MAX_AWAY_DAYS = 180;
