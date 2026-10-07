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
export type JobIssueStatus = "CHAT" | "RESOLVED" | "OPEN" | "UPHELD" | "REJECTED" | "UNRESOLVED";

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
  UNRESOLVED: "Non risolta tra voi (pagamento diretto)",
};

/**
 * Controversie standard (decisioni dell'utente del 29/09/2026,
 * docs/CHANGELOG.md §167), sul modello della Garanzia dalla A alla Z di
 * Amazon adattato al nostro contesto, con le stesse tempistiche:
 * 1. contatto diretto in chat: il professionista ha 48 ore per rispondere e
 *    provare a risolvere; se non scrive, la segnalazione passa da sola al
 *    nostro team; se risponde ma non si trova un accordo, il cliente la
 *    passa al team;
 * 2. dal passaggio al team il professionista ha 72 ore per dare la sua
 *    versione con le prove: se non risponde, la segnalazione è accolta
 *    automaticamente;
 * 3. se servono altre informazioni, l'admin le chiede e il professionista ha
 *    72 ore per rispondere, altrimenti la segnalazione è accolta;
 * 4. con le prove complete l'admin decide entro 2 giorni (decisione
 *    dell'utente);
 * 5. contro una decisione "accolta" il professionista può fare ricorso entro
 *    30 giorni; lo esamina un admin diverso.
 */
export const JOB_ISSUE_PRO_REPLY_HOURS = 48;
export const JOB_ISSUE_EVIDENCE_HOURS = 72;
export const JOB_ISSUE_INFO_HOURS = 72;
export const JOB_ISSUE_DECISION_HOURS = 48;
export const JOB_ISSUE_APPEAL_DAYS = 30;
/** Finestra in cui si contano le segnalazioni accolte per le misure progressive. */
export const JOB_ISSUE_SANCTION_WINDOW_DAYS = 30;
/** Durata di abbassamento nel ranking e di blocco delle nuove richieste. */
export const JOB_ISSUE_SANCTION_DAYS = 14;

export type JobIssueEscalationReason = "CLIENT" | "PRO_NO_REPLY";
export const JOB_ISSUE_ESCALATION_LABEL: Record<JobIssueEscalationReason, string> = {
  CLIENT: "Il cliente ha indicato che non avete risolto",
  PRO_NO_REPLY: "Il professionista non ha risposto in chat entro 48 ore",
};

/** Decisione automatica a favore del cliente per mancata risposta del professionista. */
export type JobIssueAutoDecision = "NO_EVIDENCE" | "NO_INFO";
export const JOB_ISSUE_AUTO_DECISION_NOTE: Record<JobIssueAutoDecision, string> = {
  NO_EVIDENCE: `Il professionista non ha inviato la sua versione entro ${JOB_ISSUE_EVIDENCE_HOURS} ore dal passaggio al nostro team. La segnalazione è accolta automaticamente.`,
  NO_INFO: `Il professionista non ha inviato le informazioni richieste entro ${JOB_ISSUE_INFO_HOURS} ore. La segnalazione è accolta automaticamente.`,
};

/** Lavoro pagato online con Stripe (§168): ha la nostra assistenza e il rimborso se la segnalazione è accolta. */
export function jobPaidOnline(jobPayment: { paymentMethod: string } | null | undefined): boolean {
  return !!jobPayment && jobPayment.paymentMethod === "MANOVIA";
}

/** Misure progressive: 1ª accolta avvertimento, 2ª in 30 giorni più in basso, 3ª niente nuove richieste. */
export type JobIssueSanction = "WARNING" | "DEMOTED" | "BLOCKED";
export const JOB_ISSUE_SANCTION_LABEL: Record<JobIssueSanction, string> = {
  WARNING: "Avvertimento",
  DEMOTED: "Profilo più in basso nella ricerca e nello smistamento per 14 giorni",
  BLOCKED: "Nessuna nuova richiesta per 14 giorni",
};

export type JobIssueAppealDecision = "ACCEPTED" | "REJECTED";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * `assisted`: il lavoro è pagato online, quindi ha la nostra assistenza
 * (§168). Con il pagamento diretto la segnalazione resta tra cliente e
 * professionista: niente passaggio al team, né automatico né su richiesta.
 */
type ChatIssue = { status: string; createdAt: Date; proRepliedAt: Date | null; assisted?: boolean };

/** In chat il professionista non ha scritto entro 48 ore: la segnalazione passa da sola al team. */
export function jobIssueAutoEscalation(issue: ChatIssue, now: Date): JobIssueEscalationReason | null {
  if (issue.status !== "CHAT" || issue.proRepliedAt || issue.assisted === false) return null;
  return now.getTime() - issue.createdAt.getTime() >= JOB_ISSUE_PRO_REPLY_HOURS * HOUR_MS ? "PRO_NO_REPLY" : null;
}

/**
 * Il cliente può passare la segnalazione al team: dopo che il professionista
 * ha risposto (risposta non soddisfacente) o passate le 48 ore. Prima gli
 * lasciamo il tempo di rispondere, come il contatto diretto di Amazon.
 */
export function jobIssueCanEscalate(issue: ChatIssue, now: Date): boolean {
  if (issue.status !== "CHAT") return false;
  // Pagamento diretto: "Non abbiamo risolto" chiude la segnalazione tra le parti, in qualunque momento.
  if (issue.assisted === false) return true;
  return !!issue.proRepliedAt || now.getTime() - issue.createdAt.getTime() >= JOB_ISSUE_PRO_REPLY_HOURS * HOUR_MS;
}

/** Quando il professionista può essere considerato "senza risposta" in chat. */
export function jobIssueChatReplyDueAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + JOB_ISSUE_PRO_REPLY_HOURS * HOUR_MS);
}

export type JobIssueDeadlineInput = {
  status: string;
  escalatedAt: Date | null;
  professionalRespondedAt: Date | null;
  infoRequestedAt: Date | null;
  infoRespondedAt: Date | null;
};

/** Entro quando il professionista deve dare la sua versione (72 ore dal passaggio al team). */
export function jobIssueEvidenceDueAt(escalatedAt: Date): Date {
  return new Date(escalatedAt.getTime() + JOB_ISSUE_EVIDENCE_HOURS * HOUR_MS);
}

export function jobIssueInfoDueAt(infoRequestedAt: Date): Date {
  return new Date(infoRequestedAt.getTime() + JOB_ISSUE_INFO_HOURS * HOUR_MS);
}

const infoPending = (i: JobIssueDeadlineInput) => !!i.infoRequestedAt && (!i.infoRespondedAt || i.infoRespondedAt < i.infoRequestedAt);

/**
 * Fase di una segnalazione in esame: in attesa della versione del
 * professionista, in attesa delle informazioni chieste, oppure da decidere.
 * Con la scadenza di ciascuna.
 */
export function jobIssueReviewPhase(
  i: JobIssueDeadlineInput,
): { phase: "AWAITING_EVIDENCE" | "AWAITING_INFO" | "TO_DECIDE"; dueAt: Date } | null {
  if (i.status !== "OPEN" || !i.escalatedAt) return null;
  if (infoPending(i)) return { phase: "AWAITING_INFO", dueAt: jobIssueInfoDueAt(i.infoRequestedAt!) };
  // Anche la risposta alle informazioni richieste vale come versione del professionista.
  if (!i.professionalRespondedAt && !i.infoRespondedAt) return { phase: "AWAITING_EVIDENCE", dueAt: jobIssueEvidenceDueAt(i.escalatedAt) };
  const readyAt = Math.max(i.escalatedAt.getTime(), i.professionalRespondedAt?.getTime() ?? 0, i.infoRespondedAt?.getTime() ?? 0);
  return { phase: "TO_DECIDE", dueAt: new Date(readyAt + JOB_ISSUE_DECISION_HOURS * HOUR_MS) };
}

/** Il professionista non ha risposto in tempo: decisione automatica a favore del cliente. */
export function jobIssueAutoDecision(i: JobIssueDeadlineInput, now: Date): JobIssueAutoDecision | null {
  const phase = jobIssueReviewPhase(i);
  if (!phase || phase.phase === "TO_DECIDE" || now.getTime() < phase.dueAt.getTime()) return null;
  return phase.phase === "AWAITING_INFO" ? "NO_INFO" : "NO_EVIDENCE";
}

/** Misura per la n-esima segnalazione accolta negli ultimi 30 giorni (n ≥ 1, questa inclusa). */
export function jobIssueSanctionFor(upheldInWindow: number): JobIssueSanction {
  if (upheldInWindow >= 3) return "BLOCKED";
  if (upheldInWindow === 2) return "DEMOTED";
  return "WARNING";
}

/** Il professionista può ancora fare ricorso? */
export function jobIssueCanAppeal(
  issue: { status: string; resolvedAt: Date | null; appealedAt: Date | null },
  now: Date,
): boolean {
  if (issue.status !== "UPHELD" || !issue.resolvedAt || issue.appealedAt) return false;
  return now.getTime() <= issue.resolvedAt.getTime() + JOB_ISSUE_APPEAL_DAYS * DAY_MS;
}

/** Restrizioni in corso su un profilo (misure delle segnalazioni). */
export function professionalRestrictions(
  p: { demotedUntil: Date | null; requestsBlockedUntil: Date | null },
  now: Date,
): { demoted: boolean; blocked: boolean } {
  return {
    demoted: !!p.demotedUntil && p.demotedUntil.getTime() > now.getTime(),
    blocked: !!p.requestsBlockedUntil && p.requestsBlockedUntil.getTime() > now.getTime(),
  };
}

/**
 * Esiti standard: motivazioni già scritte che l'admin sceglie e può
 * ritoccare, così casi uguali ricevono la stessa decisione.
 */
export const JOB_ISSUE_DECISION_TEMPLATES: Record<JobIssueType, { decision: "UPHELD" | "REJECTED"; label: string; note: string }[]> = {
  NO_SHOW: [
    {
      decision: "UPHELD",
      label: "Il professionista non ha risposto",
      note: "Il professionista non ha risposto alla segnalazione né ha dimostrato di essersi presentato. La segnalazione è accolta.",
    },
    {
      decision: "UPHELD",
      label: "Assenza confermata in chat",
      note: "Dalla chat risulta che il professionista non si è presentato all'appuntamento concordato. La segnalazione è accolta.",
    },
    {
      decision: "REJECTED",
      label: "Presenza dimostrata",
      note: "Il professionista ha dimostrato di essersi presentato all'appuntamento (messaggi o prove fornite). La segnalazione è respinta.",
    },
    {
      decision: "REJECTED",
      label: "Appuntamento spostato d'accordo",
      note: "Dalla chat risulta che l'appuntamento era stato spostato o annullato d'accordo tra le parti. La segnalazione è respinta.",
    },
  ],
  BAD_WORK: [
    {
      decision: "UPHELD",
      label: "Difetti evidenti dalle foto",
      note: "Le foto mostrano difetti evidenti rispetto al lavoro concordato e il professionista non ha proposto una soluzione. La segnalazione è accolta.",
    },
    {
      decision: "UPHELD",
      label: "Il professionista non ha risposto",
      note: "Il professionista non ha risposto alla segnalazione né ha proposto una soluzione. La segnalazione è accolta.",
    },
    {
      decision: "REJECTED",
      label: "Lavoro conforme al preventivo",
      note: "Il lavoro risulta conforme a quanto concordato nel preventivo e le foto non mostrano difetti. La segnalazione è respinta.",
    },
    {
      decision: "REJECTED",
      label: "Soluzione offerta e rifiutata",
      note: "Il professionista ha proposto di rimediare in modo ragionevole e il cliente non ha accettato. La segnalazione è respinta.",
    },
  ],
};

/**
 * Testo standard dell'esito per cliente e professionista: sempre lo stesso
 * schema, con la motivazione dell'admin e le vie che restano aperte (la
 * decisione non vincola nessuno: mediazione e giudice restano sempre
 * possibili).
 */
export function jobIssueOutcomeText(input: {
  type: JobIssueType;
  decision: "UPHELD" | "REJECTED";
  note: string;
  audience: "client" | "professional";
  paidOnline?: boolean;
  /** false dove il ricorso ha già il suo modulo sotto (pannello del professionista). */
  withAppealHint?: boolean;
}): string {
  const esito = input.decision === "UPHELD" ? "accolta" : "respinta";
  const upheld = input.decision === "UPHELD";
  const rimborso =
    upheld && input.paidOnline
      ? input.audience === "client"
        ? " Avendo pagato sul sito, ti rimborsiamo l'importo del lavoro sul metodo di pagamento usato."
        : " Il lavoro era stato pagato sul sito: l'importo viene rimborsato al cliente."
      : "";
  const rimedi =
    input.audience === "professional" && upheld && input.withAppealHint !== false
      ? ` Puoi fare ricorso entro ${JOB_ISSUE_APPEAL_DAYS} giorni: lo esaminerà una persona diversa del nostro team.`
      : "";
  return `La segnalazione "${JOB_ISSUE_LABEL[input.type].toLowerCase()}" è stata ${esito}. Motivazione: ${input.note}${rimborso}${rimedi} La nostra decisione non impedisce di rivolgersi a un organismo di mediazione o al giudice.`;
}

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
  escalatedAt: string | null;
  escalationReason: JobIssueEscalationReason | null;
  /** In chat: il professionista ha scritto? Entro quando deve farlo, e se il cliente può già passarla al team. */
  proRepliedInChat: boolean;
  chatReplyDueAt: string | null;
  canEscalate: boolean;
  /** In esame: in attesa della versione del professionista, di informazioni, o da decidere, con la scadenza. */
  reviewPhase: "AWAITING_EVIDENCE" | "AWAITING_INFO" | "TO_DECIDE" | null;
  phaseDueAt: string | null;
  infoRequestText: string | null;
  infoRequestedAt: string | null;
  infoResponse: string | null;
  infoRespondedAt: string | null;
  autoDecision: JobIssueAutoDecision | null;
  /** Lavoro pagato sul sito con Stripe: se la segnalazione è accolta il cliente è rimborsato. */
  paidOnline: boolean;
  /** Pagamento online scelto: la segnalazione ha la nostra assistenza. False con il pagamento diretto (§168). */
  assisted: boolean;
  sanction: JobIssueSanction | null;
  appealedAt: string | null;
  appealText: string | null;
  appealDecision: JobIssueAppealDecision | null;
  appealNote: string | null;
  /** Il professionista può ancora fare ricorso (entro 14 giorni da "accolta"). */
  canAppeal: boolean;
  /** Il cliente può inviare la richiesta ad altri (mancata presentazione accolta, non ancora fatto). */
  canRedispatch: boolean;
  redispatchedGuidedRequestId: string | null;
};

export type JobIssueWindowInput = {
  status: string;
  scheduledAt: Date;
  scheduledEndAt: Date | null;
  professionalCompletedAt: Date | null;
  clientConfirmedCompletedAt: Date | null;
  /** Conferma d'ufficio allo scadere del termine (§187): non riapre la finestra. */
  completionAutoClosedAt?: Date | null;
  hasIssue: boolean;
};


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
  const clientConfirmed = b.completionAutoClosedAt ? null : b.clientConfirmedCompletedAt;
  const lastEvent = Math.max(end, b.professionalCompletedAt?.getTime() ?? 0, clientConfirmed?.getTime() ?? 0);
  if (t >= b.scheduledAt.getTime() && t <= lastEvent + BAD_WORK_REPORT_DAYS * DAY_MS) {
    allowed.push("BAD_WORK");
  }
  return allowed;
}

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
export type JobIssueChatOutcomeInput = z.infer<typeof jobIssueChatOutcomeSchema>;

export const resolveJobIssueSchema = z.object({
  decision: z.enum(["UPHELD", "REJECTED"]),
  note: z.string().trim().min(3, "Scrivi la motivazione della decisione.").max(1000),
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

/**
 * Il cliente può recensire: subito dopo aver cliccato "Lavoro terminato",
 * anche se il professionista non l'ha ancora fatto (docs/CHANGELOG.md §186:
 * la recensione resta nascosta finché entrambi non hanno chiuso e
 * recensito); oppure dopo la decisione dell'admin su una sua segnalazione, anche
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
  if (b.issueStatus === "UPHELD" || b.issueStatus === "REJECTED" || b.issueStatus === "RESOLVED" || b.issueStatus === "UNRESOLVED") return true;
  return (b.status === "COMPLETED" || b.status === "CONFIRMED") && b.clientConfirmedCompletedAt !== null;
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
  escalatedAt: Date | null;
  escalationReason: string | null;
  infoRequestText: string | null;
  infoRequestedAt: Date | null;
  infoResponse: string | null;
  infoRespondedAt: Date | null;
  autoDecision: string | null;
  sanction: string | null;
  appealedAt: Date | null;
  appealText: string | null;
  appealDecision: string | null;
  appealNote: string | null;
  redispatchedGuidedRequestId: string | null;
};

/**
 * `extra.proRepliedAt`: primo messaggio del professionista in chat dopo la
 * segnalazione (o la sua risposta); `extra.paidOnline`: lavoro pagato sul
 * sito con Stripe.
 */
export function toJobIssueSummary(
  issue: IssueRow | null,
  extra: { proRepliedAt?: Date | null; paidOnline?: boolean; assisted?: boolean } = {},
  now: Date = new Date(),
): JobIssueSummary | null {
  if (!issue) return null;
  const escalatedAt = issue.escalatedAt ?? (issue.status === "OPEN" ? issue.createdAt : null);
  const proRepliedAt = extra.proRepliedAt ?? issue.professionalRespondedAt;
  const assisted = extra.assisted !== false;
  const chat = { status: issue.status, createdAt: issue.createdAt, proRepliedAt, assisted };
  const phase = jobIssueReviewPhase({ ...issue, escalatedAt });
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
    escalatedAt: issue.escalatedAt?.toISOString() ?? null,
    escalationReason: (issue.escalationReason as JobIssueEscalationReason | null) ?? null,
    proRepliedInChat: !!proRepliedAt,
    chatReplyDueAt: issue.status === "CHAT" && assisted ? jobIssueChatReplyDueAt(issue.createdAt).toISOString() : null,
    canEscalate: jobIssueCanEscalate(chat, now),
    reviewPhase: phase?.phase ?? null,
    phaseDueAt: phase?.dueAt.toISOString() ?? null,
    infoRequestText: issue.infoRequestText,
    infoRequestedAt: issue.infoRequestedAt?.toISOString() ?? null,
    infoResponse: issue.infoResponse,
    infoRespondedAt: issue.infoRespondedAt?.toISOString() ?? null,
    autoDecision: (issue.autoDecision as JobIssueAutoDecision | null) ?? null,
    paidOnline: !!extra.paidOnline,
    assisted,
    sanction: (issue.sanction as JobIssueSanction | null) ?? null,
    appealedAt: issue.appealedAt?.toISOString() ?? null,
    appealText: issue.appealText,
    appealDecision: (issue.appealDecision as JobIssueAppealDecision | null) ?? null,
    appealNote: issue.appealNote,
    canAppeal: jobIssueCanAppeal(issue, now),
    // Anche con il pagamento diretto, se non vi siete accordati (§168).
    canRedispatch: issue.type === "NO_SHOW" && (issue.status === "UPHELD" || issue.status === "UNRESOLVED") && !issue.redispatchedGuidedRequestId,
    redispatchedGuidedRequestId: issue.redispatchedGuidedRequestId,
  };
}
