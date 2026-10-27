import { z } from "zod";
import "./zod";
import { PROBLEM_DESCRIPTION_MAX } from "./problemMatch";

/** Corpi delle rotte "dal problema ai mestieri" (docs/CHANGELOG.md §387). */

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
});
export type ProblemTakeoverInput = z.infer<typeof problemTakeoverSchema>;

export const teachProblemWordSchema = z.object({
  word: z.string().trim().min(3).max(60),
  categorySlug: z.string().trim().max(40).optional(),
  outOfService: z.string().trim().max(40).optional(),
});
export type TeachProblemWordInput = z.infer<typeof teachProblemWordSchema>;

export const mergeServiceNameSchema = z.object({
  name: z.string().trim().min(1).max(120),
  canonical: z.string().trim().min(1).max(120),
});
export type MergeServiceNameInput = z.infer<typeof mergeServiceNameSchema>;
