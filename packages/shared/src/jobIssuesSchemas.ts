import { z } from "zod";
import "./zod";
import { JOB_ISSUE_REFUND_PERCENTS, PROFESSIONAL_JOB_PROBLEM_REASONS, ProfessionalJobProblemReason, jobIssueTypes } from "./jobIssues";

/**
 * Controlli dei moduli (zod) di `jobIssues.ts`, in un file loro: le pagine che
 * usano solo le funzioni di `jobIssues.ts` non creano questi schemi all'apertura
 * (docs/changelog/2026-11-02-oggi-piu-leggera.md).
 */
// Prove minime (§167): per un lavoro non andato bene almeno una foto; per
// la mancata presentazione basta la chat, che l'admin legge.
export const reportJobIssueSchema = z
  .object({
    type: z.enum(jobIssueTypes),
    description: z.string().trim().min(10, "Descrivi cosa è successo (almeno 10 caratteri).").max(2000),
    photoUrls: z.array(z.string().url()).max(5).default([]),
  })
  .refine((v) => v.type !== "BAD_WORK" || v.photoUrls.length > 0, {
    message: "Aggiungi almeno una foto del lavoro: ci serve per valutare la segnalazione.",
    path: ["photoUrls"],
  });
export type ReportJobIssueInput = z.infer<typeof reportJobIssueSchema>;

export const jobIssueResponseSchema = z.object({
  response: z.string().trim().min(3, "Scrivi la tua versione.").max(2000),
});
export type JobIssueResponseInput = z.infer<typeof jobIssueResponseSchema>;

export const jobIssueChatOutcomeSchema = z.object({ outcome: z.enum(["RESOLVED", "ESCALATE"]) });

/** Rimborso proposto dal professionista in chat su un lavoro pagato online (collaudo F-03). */
export const jobIssueRefundOfferSchema = z.object({ amountEurCents: z.number().int().positive() });
export type JobIssueRefundOfferInput = z.infer<typeof jobIssueRefundOfferSchema>;
export type JobIssueChatOutcomeInput = z.infer<typeof jobIssueChatOutcomeSchema>;

export const resolveJobIssueSchema = z.object({
  decision: z.enum(["UPHELD", "REJECTED"]),
  note: z.string().trim().min(3, "Scrivi la motivazione della decisione.").max(1000),
  /** Solo se accolta e pagata online: quanto rimborsare (100, 50 o 20%, §267). */
  refundPercent: z
    .number()
    .int()
    .refine((v) => (JOB_ISSUE_REFUND_PERCENTS as readonly number[]).includes(v), "Il rimborso è del 100, 50 o 20%.")
    .optional(),
});
export type ResolveJobIssueInput = z.infer<typeof resolveJobIssueSchema>;

export const jobIssueInfoRequestSchema = z.object({
  text: z.string().trim().min(5, "Scrivi quali informazioni servono.").max(1000),
});
export type JobIssueInfoRequestInput = z.infer<typeof jobIssueInfoRequestSchema>;

export const appealJobIssueSchema = z.object({
  text: z.string().trim().min(10, "Spiega perché la decisione è sbagliata (almeno 10 caratteri).").max(2000),
});
export type AppealJobIssueInput = z.infer<typeof appealJobIssueSchema>;

export const resolveJobIssueAppealSchema = z.object({
  decision: z.enum(["ACCEPTED", "REJECTED"]),
  note: z.string().trim().min(3, "Scrivi la motivazione.").max(1000),
});
export type ResolveJobIssueAppealInput = z.infer<typeof resolveJobIssueAppealSchema>;

export const reportProfessionalJobProblemSchema = z.object({
  reason: z.enum(PROFESSIONAL_JOB_PROBLEM_REASONS.map((r) => r.value) as [ProfessionalJobProblemReason, ...ProfessionalJobProblemReason[]]),
  description: z.string().trim().min(10, "Descrivi cosa è successo (almeno 10 caratteri).").max(1000),
  photoUrls: z.array(z.string().url()).max(5).default([]),
});
export type ReportProfessionalJobProblemInput = z.infer<typeof reportProfessionalJobProblemSchema>;
