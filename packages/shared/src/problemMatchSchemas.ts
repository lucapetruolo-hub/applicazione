import { z } from "zod";
import "./zod";
import { PROBLEM_DESCRIPTION_MAX } from "./limits";
import { PROBLEM_EXAMPLE_MAX } from "./problemExamples";

/** Corpi delle rotte "dal problema ai mestieri" (docs/CHANGELOG.md §392). */

export const problemMatchRequestSchema = z.object({
  description: z.string().trim().min(3).max(PROBLEM_DESCRIPTION_MAX),
  city: z.string().trim().max(80).optional(),
  /** Mestiere che il cliente ha toccato fra quelli proposti (solo per contarlo in Admin). */
  chosen: z.string().trim().max(40).optional(),
  /** Ricerca partita da una foto: il risultato già pronto (docs/changelog/2026-11-13-ricerca-con-foto.md). */
  photo: z.string().uuid().optional(),
});
export type ProblemMatchRequest = z.infer<typeof problemMatchRequestSchema>;

/** Testo e città che accompagnano la foto del problema (campi del modulo multipart). */
export const problemPhotoRequestSchema = z.object({
  description: z.string().trim().max(PROBLEM_DESCRIPTION_MAX).optional(),
  city: z.string().trim().max(80).optional(),
});
export type ProblemPhotoRequest = z.infer<typeof problemPhotoRequestSchema>;

/**
 * Esito della foto: "ok" va ai risultati; "dati-personali" va ai risultati ma
 * la foto non si allega alla richiesta (persone, documenti, numeri: CLAUDE.md
 * §5 punto 9); "non-pertinente" e "non-adatta" chiedono di scrivere il problema.
 */
export type ProblemPhotoCheck = "ok" | "dati-personali" | "non-pertinente" | "non-adatta";

export type ProblemPhotoResult =
  | { photoId: string; description: string; check: "ok" | "dati-personali" }
  | { photoId: null; description: null; check: "non-pertinente" | "non-adatta" | "spenta" };

/** "Prendete in carico la richiesta": un lavoro che nessun professionista del sito fa. */
export const problemTakeoverSchema = z.object({
  description: z.string().trim().min(3).max(PROBLEM_DESCRIPTION_MAX),
  city: z.string().trim().max(80).optional(),
  outOfService: z.string().trim().max(40).optional(),
  /** Mestiere che il sito non ha, proposto dall'IA (docs/changelog/2026-11-11-mestieri-che-mancano.md). */
  missingTrade: z.string().trim().max(40).optional(),
});
export type ProblemTakeoverInput = z.infer<typeof problemTakeoverSchema>;

export const teachProblemWordSchema = z.object({
  word: z.string().trim().min(3).max(60),
  categorySlug: z.string().trim().max(40).optional(),
  outOfService: z.string().trim().max(40).optional(),
  /** Prestazione del catalogo del mestiere a cui porta anche la parola (docs/changelog/2026-11-06-dizionario-prestazioni.md). */
  serviceName: z.string().trim().max(120).optional(),
});
export type TeachProblemWordInput = z.infer<typeof teachProblemWordSchema>;

export const mergeServiceNameSchema = z.object({
  name: z.string().trim().min(1).max(120),
  canonical: z.string().trim().min(1).max(120),
});
export type MergeServiceNameInput = z.infer<typeof mergeServiceNameSchema>;

/** "Aggiungi alle standard": il nome entra tra le prestazioni suggerite di una categoria (§388). */
export const addStandardServiceSchema = z.object({
  name: z.string().trim().min(2).max(80),
  categorySlug: z.string().trim().min(1).max(40),
});
export type AddStandardServiceInput = z.infer<typeof addStandardServiceSchema>;

/** Frase d'esempio aggiunta dall'admin in "Mestieri richiesti" (docs/changelog/2026-11-03-luci-che-accelerano.md). */
export const addProblemExampleSchema = z.object({
  text: z.string().trim().min(3).max(PROBLEM_EXAMPLE_MAX),
});
export type AddProblemExampleInput = z.infer<typeof addProblemExampleSchema>;
