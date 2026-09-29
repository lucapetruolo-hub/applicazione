import { z } from "zod";

/**
 * Segnalazioni di un problema sul lavoro da parte del cliente (decisione
 * dell'utente del 29/09/2026, docs/CHANGELOG.md §164):
 * - "Il professionista non si è presentato": dall'orario di fine
 *   dell'appuntamento, entro 7 giorni, finché il cliente non ha confermato
 *   che il lavoro è terminato;
 * - "Il lavoro non è andato bene": dall'inizio dell'appuntamento, entro 14
 *   giorni dall'ultimo tra fine appuntamento, chiusura del professionista e
 *   conferma del cliente (difetti scoperti dopo).
 * Una sola segnalazione per lavoro. Prima fase (§165, decisione
 * dell'utente): cliente e professionista provano a risolvere in chat
 * (`CHAT`); se si accordano la segnalazione si chiude (`RESOLVED`), se no il
 * cliente la passa al nostro team (`OPEN`), che decide. Una mancata
 * presentazione accolta abbassa l'affidabilità del professionista, e la
 * recensione si può lasciare dopo la chiusura.
 */

export const jobIssueTypes = ["NO_SHOW", "BAD_WORK"] as const;
export type JobIssueType = (typeof jobIssueTypes)[number];
export type JobIssueStatus = "CHAT" | "RESOLVED" | "OPEN" | "UPHELD" | "REJECTED";

export const NO_SHOW_REPORT_DAYS = 7;
export const BAD_WORK_REPORT_DAYS = 14;

export const JOB_ISSUE_LABEL: Record<JobIssueType, string> = {
  NO_SHOW: "Il professionista non si è presentato",
  BAD_WORK: "Il lavoro non è andato bene",
};

export const JOB_ISSUE_STATUS_LABEL: Record<JobIssueStatus, string> = {
  CHAT: "In chat con il professionista",
  RESOLVED: "Risolta con il professionista",
  OPEN: "In esame dal nostro team",
  UPHELD: "Accolta",
  REJECTED: "Respinta",
};

export type JobIssueSummary = {
  id: string;
  type: JobIssueType;
  status: JobIssueStatus;
  description: string;
  photoUrls: string[];
  createdAt: string;
  professionalResponse: string | null;
  professionalRespondedAt: string | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
};

export type JobIssueWindowInput = {
  status: string;
  scheduledAt: Date;
  scheduledEndAt: Date | null;
  professionalCompletedAt: Date | null;
  clientConfirmedCompletedAt: Date | null;
  hasIssue: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Quali problemi il cliente può segnalare adesso su questo lavoro (vuoto = nessuno). */
export function jobIssueTypesAllowed(b: JobIssueWindowInput, now: Date): JobIssueType[] {
  if (b.hasIssue) return [];
  if (b.status !== "CONFIRMED" && b.status !== "COMPLETED") return [];
  const t = now.getTime();
  const end = (b.scheduledEndAt ?? b.scheduledAt).getTime();
  const allowed: JobIssueType[] = [];
  if (!b.clientConfirmedCompletedAt && t >= end && t <= end + NO_SHOW_REPORT_DAYS * DAY_MS) {
    allowed.push("NO_SHOW");
  }
  const lastEvent = Math.max(end, b.professionalCompletedAt?.getTime() ?? 0, b.clientConfirmedCompletedAt?.getTime() ?? 0);
  if (t >= b.scheduledAt.getTime() && t <= lastEvent + BAD_WORK_REPORT_DAYS * DAY_MS) {
    allowed.push("BAD_WORK");
  }
  return allowed;
}

export const reportJobIssueSchema = z.object({
  type: z.enum(jobIssueTypes),
  description: z.string().trim().min(10, "Descrivi cosa è successo (almeno 10 caratteri).").max(2000),
  photoUrls: z.array(z.string().url()).max(5).default([]),
});
export type ReportJobIssueInput = z.infer<typeof reportJobIssueSchema>;

export const jobIssueResponseSchema = z.object({
  response: z.string().trim().min(3, "Scrivi la tua versione.").max(2000),
});
export type JobIssueResponseInput = z.infer<typeof jobIssueResponseSchema>;

export const jobIssueChatOutcomeSchema = z.object({ outcome: z.enum(["RESOLVED", "ESCALATE"]) });
export type JobIssueChatOutcomeInput = z.infer<typeof jobIssueChatOutcomeSchema>;

export const resolveJobIssueSchema = z.object({
  decision: z.enum(["UPHELD", "REJECTED"]),
  note: z.string().trim().min(3, "Scrivi la motivazione della decisione.").max(1000),
});
export type ResolveJobIssueInput = z.infer<typeof resolveJobIssueSchema>;

/**
 * Il cliente può recensire: dopo aver confermato un lavoro completato, come
 * prima; oppure dopo la decisione dell'admin su una sua segnalazione, anche
 * se il lavoro non è mai stato chiuso (es. mancata presentazione), o dopo
 * un accordo in chat. Mai mentre la segnalazione è aperta (in chat o in esame).
 */
export function clientCanReview(b: {
  status: string;
  clientConfirmedCompletedAt: Date | string | null;
  hasReview: boolean;
  issueStatus: JobIssueStatus | null;
}): boolean {
  if (b.hasReview) return false;
  if (b.issueStatus === "OPEN" || b.issueStatus === "CHAT") return false;
  if (b.issueStatus === "UPHELD" || b.issueStatus === "REJECTED" || b.issueStatus === "RESOLVED") return true;
  return b.status === "COMPLETED" && b.clientConfirmedCompletedAt !== null;
}

type IssueRow = {
  id: string;
  type: JobIssueType;
  status: JobIssueStatus;
  description: string;
  photoUrls: string[];
  createdAt: Date;
  professionalResponse: string | null;
  professionalRespondedAt: Date | null;
  resolutionNote: string | null;
  resolvedAt: Date | null;
};

export function toJobIssueSummary(issue: IssueRow | null): JobIssueSummary | null {
  if (!issue) return null;
  return {
    id: issue.id,
    type: issue.type,
    status: issue.status,
    description: issue.description,
    photoUrls: issue.photoUrls,
    createdAt: issue.createdAt.toISOString(),
    professionalResponse: issue.professionalResponse,
    professionalRespondedAt: issue.professionalRespondedAt?.toISOString() ?? null,
    resolutionNote: issue.resolutionNote,
    resolvedAt: issue.resolvedAt?.toISOString() ?? null,
  };
}
