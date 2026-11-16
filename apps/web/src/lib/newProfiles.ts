import type { ProfessionalNewestResult } from "@professionisti/shared";

/**
 * "Nuovi profili" della home (NewProfilesCarousel): gli ultimi 21 iscritti,
 * con i soli dati che la scheda mostra. Prima la home mandava al browser
 * tutti i professionisti (docs/changelog/2026-11-09-meno-javascript-comune.md)
 * e poi li chiedeva comunque tutti all'API a ogni visita; ora l'API manda solo
 * questi (GET /professionals/newest, docs/changelog/2026-11-16-traffico-elevato.md).
 */
export const NEW_PROFILES_COUNT = 21;

export type NewProfileSummary = ProfessionalNewestResult;
