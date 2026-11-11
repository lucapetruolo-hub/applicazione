import { z } from "zod";
import "./zod";
import { PROBLEM_DESCRIPTION_MAX } from "./limits";
import { PROBLEM_EXAMPLE_MAX } from "./problemExamples";

/** Corpi delle rotte "dal problema ai mestieri" (docs/CHANGELOG.md §392). */

export const problemMatchRequestSchema = z.object({
  description: z.string().trim().min(3).max(PROBLEM_DESCRIPTION_MAX),
  city: z.string().trim().max(80).optional(),
});
export type ProblemMatchRequest = z.infer<typeof problemMatchRequestSchema>;

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
