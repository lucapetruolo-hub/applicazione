import { z } from "zod";
import "./zod";
import {
  CHURN_REASONS,
  DEVICE_KINDS,
  PRICE_TOOL_STEP_KEYS,
  PROFILE_REQUEST_SOURCES,
  REQUEST_ORIGINS,
  REQUEST_STEP_KEYS,
  SUBMIT_FAILURE_KINDS,
  SUBMIT_FORM_KEYS,
} from "./siteStats";

// Schemi zod dell'andamento del sito, separati da siteStats.ts: le pagine
// pubbliche usano costanti di quel file (PROFILE_REQUEST_SOURCE_PARAM) e
// con gli schemi nello stesso file caricavano tutto zod
// (docs/changelog/2026-11-09-meno-javascript-comune.md).

export const churnReasonSchema = z.enum(CHURN_REASONS);

/** Motivo facoltativo quando si elimina l'account o si annulla l'abbonamento (§372). */
export const churnReasonBodySchema = z.object({ reason: churnReasonSchema.optional() }).default({});
export type ChurnReasonBody = z.infer<typeof churnReasonBodySchema>;

export const siteStepEventSchema = z.object({
  step: z.enum(REQUEST_STEP_KEYS),
  categorySlug: z.string().max(60).optional(),
  origin: z.enum(REQUEST_ORIGINS).optional(),
  /** Solo con origin PROFILE (§402). */
  source: z.enum(PROFILE_REQUEST_SOURCES).optional(),
  device: z.enum(DEVICE_KINDS).optional(),
});
export type SiteStepEvent = z.infer<typeof siteStepEventSchema>;

export const priceToolStepEventSchema = z.object({ step: z.enum(PRICE_TOOL_STEP_KEYS) });
export type PriceToolStepEvent = z.infer<typeof priceToolStepEventSchema>;

export const siteFailureEventSchema = z.object({
  form: z.enum(SUBMIT_FORM_KEYS),
  kind: z.enum(SUBMIT_FAILURE_KINDS),
});
export type SiteFailureEvent = z.infer<typeof siteFailureEventSchema>;

/** Profilo pubblico aperto, solo il dispositivo (§402). */
export const siteProfileViewEventSchema = z.object({ device: z.enum(DEVICE_KINDS) });
export type SiteProfileViewEvent = z.infer<typeof siteProfileViewEventSchema>;

export const siteNoteSchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida."),
  text: z.string().trim().min(2, "Scrivi la nota.").max(140, "Al massimo 140 caratteri."),
});
export type SiteNoteInput = z.infer<typeof siteNoteSchema>;

export const siteAdviceDoneSchema = z.object({
  key: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(300),
});
export type SiteAdviceDoneInput = z.infer<typeof siteAdviceDoneSchema>;
export const siteAdviceUndoSchema = z.object({ key: z.string().trim().min(1).max(200) });
export type SiteAdviceUndoInput = z.infer<typeof siteAdviceUndoSchema>;
